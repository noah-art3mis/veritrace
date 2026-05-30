import type { ClaimItem, ClaimTally, EvidenceItem, Reliability, Verdict } from "../graph-types";

// Deterministic verdict aggregation — STATED, not learned (PLAN.md / CONTEXT.md). The
// mapping from evidence to verdict is a fixed rule the user can inspect, not a black box.
//
// Two orthogonal, stated gates decide whether a piece of evidence can MOVE a verdict:
//   1. stance legibility — the classifier read the stance clearly enough (stanceConfidence).
//   2. evidence quality  — VERITRACE's core principle (CONTEXT.md) is that a verdict's
//      uncertainty lives in SOURCE RELIABILITY, not a bare confidence %. So a low-reliability
//      source (blog / social aggregator / anonymous) can only *contextualize* — it cannot
//      establish or flip a verdict on its own. Only high/medium reliability decides.
// Evidence failing either gate leaves the claim at Not-Enough-Evidence.

// Minimum stance-confidence for the classifier's stance reading to count at all.
const MIN_STANCE_CONFIDENCE = 0.5;

// Reliability tiers allowed to *establish* a verdict; "low" can only contextualize.
const DECIDING_RELIABILITY: ReadonlySet<Reliability> = new Set<Reliability>(["high", "medium"]);

/** Whether an evidence item carries enough quality + clarity to move a verdict. */
export function isDeciding(e: EvidenceItem): boolean {
  return DECIDING_RELIABILITY.has(e.reliability) && (e.stanceConfidence ?? 0) >= MIN_STANCE_CONFIDENCE;
}

/** Aggregate a single claim's evidence into its advisory Verdict. */
export function claimVerdict(claim: ClaimItem, evidence: EvidenceItem[]): Verdict {
  // Claims a text+web build can't check (media provenance / synthetic), and claims that
  // aren't verifiable factual assertions at all (opinion / value judgement / prediction —
  // SAFE's "irrelevant"), both resolve to NEI by design without consuming the evidence bar.
  if (!claim.checkable || claim.checkworthy === false) return "nei";

  const deciding = evidence.filter(isDeciding);
  const supports = deciding.some((e) => e.stance === "supports");
  const refutes = deciding.some((e) => e.stance === "refutes");

  if (supports && refutes) return "conflicting";
  if (refutes) return "refuted";
  if (supports) return "supported";
  // Only contextual evidence, or nothing usable → Not-Enough-Evidence.
  return "nei";
}

/**
 * Aggregate resolved claims into the source-text-level assessment. NEI claims do not
 * dominate at this level (otherwise one unverifiable fragment would sink the whole
 * document); they're simply excluded. A document mixing Supported and Refuted claims —
 * the El Mencho hero story — surfaces as Conflicting.
 */
export function sourceVerdict(claimVerdicts: Verdict[]): Verdict {
  const resolved = claimVerdicts.filter((v) => v !== "nei");
  if (resolved.length === 0) return "nei";

  const supported = resolved.some((v) => v === "supported");
  const refuted = resolved.some((v) => v === "refuted");
  const conflicting = resolved.some((v) => v === "conflicting");

  if (conflicting || (supported && refuted)) return "conflicting";
  if (refuted) return "refuted";
  return "supported";
}

/**
 * Per-verdict counts over a source's claims — the graded "X of N supported" signal
 * (SAFE F1@K). The categorical sourceVerdict collapses this; the tally preserves it so
 * the UI can show "2 of 3 supported · 1 NEI" instead of only a single label.
 */
export function tallyClaims(claimVerdicts: Verdict[]): ClaimTally {
  const tally: ClaimTally = { supported: 0, refuted: 0, conflicting: 0, nei: 0, total: claimVerdicts.length };
  for (const v of claimVerdicts) tally[v] += 1;
  return tally;
}
