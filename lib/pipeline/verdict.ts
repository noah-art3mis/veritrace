import type { ClaimItem, ClaimTally, EvidenceItem, Reliability, Verdict } from "../graph-types";
import { isSearchable } from "./claim-status";

// Deterministic verdict aggregation — STATED, not learned (PLAN.md / CONTEXT.md). The
// mapping from evidence to verdict is a fixed rule the user can inspect, not a black box.
//
// Three orthogonal, stated gates decide whether a piece of evidence can MOVE a verdict:
//   1. stance commitment — the source takes a side. Contextual background neither supports nor
//      refutes, so it can never establish or flip a verdict (and must not earn the deciding star).
//   2. stance legibility — the classifier read that stance clearly enough (stanceConfidence).
//   3. evidence quality  — VERITRACE's core principle (CONTEXT.md) is that a verdict's
//      uncertainty lives in SOURCE RELIABILITY, not a bare confidence %. So a low-reliability
//      source (blog / social aggregator / anonymous) can only *contextualize* — it cannot
//      establish or flip a verdict on its own. Only high/medium reliability decides.
// Evidence failing any gate leaves the claim at Not-Enough-Evidence.

// Minimum stance-confidence for the classifier's stance reading to count at all.
const MIN_STANCE_CONFIDENCE = 0.5;

// Reliability tiers allowed to *establish* a verdict; "low" can only contextualize.
const DECIDING_RELIABILITY: ReadonlySet<Reliability> = new Set<Reliability>(["high", "medium"]);

/** Whether an evidence item carries enough commitment + quality + clarity to move a verdict. */
export function isDeciding(e: EvidenceItem): boolean {
  return (
    e.stance !== "contextualizes" &&
    DECIDING_RELIABILITY.has(e.reliability) &&
    (e.stanceConfidence ?? 0) >= MIN_STANCE_CONFIDENCE
  );
}

/**
 * Aggregate a single claim's evidence into its advisory Verdict.
 *
 * `requirePrimary` (default true) enforces the de-novo echo-chamber guard (#51). The opt-in
 * fact-check short-circuit passes `false`: a known fact-checker's published adjudication is a
 * deliberate, documented bypass of the de-novo bar (CONTEXT.md — fact-checks are trusted
 * waypoints), and its evidence is `secondary` by design, so the primary requirement must not
 * apply there or the short-circuit could never fire.
 */
export function claimVerdict(
  claim: ClaimItem,
  evidence: EvidenceItem[],
  opts: { requirePrimary?: boolean } = {},
): Verdict {
  const { requirePrimary = true } = opts;
  // Non-searchable claims resolve to NEI by design without consuming the evidence bar:
  // relevance-dropped background, media-provenance claims a text+web build can't check, and
  // subjective claims (opinion / value judgement / prediction) that no primary source settles.
  if (!isSearchable(claim)) return "nei";

  const deciding = evidence.filter(isDeciding);

  // Echo-chamber guard (#51): a de-novo verdict requires at least one PRIMARY/originating source
  // among the deciding evidence. Reliable re-reporting alone (all secondary/opinion) — however
  // consistent — cannot establish supported/refuted; it abstains to NEI. The "keep searching
  // until ≥1 primary" rule was only ever told to the gather model (resolve.ts MIN_DECIDING);
  // this enforces it at verdict time, where it actually binds the outcome.
  if (requirePrimary && !deciding.some((e) => e.sourceType === "primary")) return "nei";

  const supports = deciding.some((e) => e.stance === "supports");
  const refutes = deciding.some((e) => e.stance === "refutes");

  // A single atomic claim is never `conflicting` (ADR 0007). Deciding evidence pulling both ways
  // means the evidence does not conclusively decide THIS claim → NEI (AVeriTeC's inconclusive),
  // not cherrypicking. Cherrypicking is a document-level property handled in sourceVerdict.
  if (supports && refutes) return "nei";
  if (refutes) return "refuted";
  if (supports) return "supported";
  // Only contextual evidence, or nothing usable → Not-Enough-Evidence.
  return "nei";
}

/** A resolved claim's verdict plus how load-bearing it is (its triage relevance score). */
export interface WeightedVerdict {
  verdict: Verdict;
  /** 0..1 load-bearingness; absent ⇒ treated as 1 (the pre-ADR-0007 unweighted behaviour). */
  relevanceScore?: number;
}

// The fraction the lighter side must reach (relative to the heavier) for a document to count as
// genuine cherrypicking rather than a settled claim with a minor opposing detail (ADR 0007).
const CONFLICT_RATIO = 0.5;

/**
 * Aggregate resolved claims into the source-text-level assessment (ADR 0007). NEI claims don't
 * dominate (one unverifiable fragment must not sink the document); they're excluded. The decision
 * is RELEVANCE-WEIGHTED so a stray low-relevance claim can't flip the document: `conflicting` is
 * reserved for genuine cherrypicking — both sides load-bearing (the El Mencho hero story) — while
 * a minor false premise under a settled central claim leaves the document at the majority verdict.
 */
export function sourceVerdict(claims: WeightedVerdict[]): Verdict {
  const resolved = claims.filter((c) => c.verdict !== "nei");
  if (resolved.length === 0) return "nei";

  const weight = (c: WeightedVerdict) => c.relevanceScore ?? 1;
  let supportWeight = 0;
  let refuteWeight = 0;
  for (const c of resolved) {
    if (c.verdict === "supported") supportWeight += weight(c);
    else if (c.verdict === "refuted") refuteWeight += weight(c);
    else if (c.verdict === "conflicting") {
      // A claim shouldn't be `conflicting` post-ADR-0007, but if a legacy/fact-check one slips in,
      // count it on both sides so the document still surfaces the mix.
      supportWeight += weight(c);
      refuteWeight += weight(c);
    }
  }

  if (supportWeight > 0 && refuteWeight > 0) {
    const minority = Math.min(supportWeight, refuteWeight);
    const majority = Math.max(supportWeight, refuteWeight);
    if (minority >= majority * CONFLICT_RATIO) return "conflicting"; // both sides load-bearing
    return supportWeight > refuteWeight ? "supported" : "refuted"; // lopsided → majority wins
  }
  return supportWeight > 0 ? "supported" : "refuted";
}

/**
 * Per-verdict counts over a source's CHECKED claims — the graded "X of N supported" signal
 * (SAFE F1@K). The categorical sourceVerdict collapses this; the tally preserves it so the
 * UI can show "2 of 3 supported · 1 NEI" instead of only a single label. `dropped` carries
 * the relevance-filtered claims separately so they're visible without inflating N.
 */
export function tallyClaims(claimVerdicts: Verdict[], dropped = 0): ClaimTally {
  const tally: ClaimTally = {
    supported: 0,
    refuted: 0,
    conflicting: 0,
    nei: 0,
    total: claimVerdicts.length,
    dropped,
  };
  for (const v of claimVerdicts) tally[v] += 1;
  return tally;
}
