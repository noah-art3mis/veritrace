import type { ClaimItem, QuestionItem, EvidenceItem, Verdict, QuestionTrace } from "../graph-types";
import type { SearchOptions, RawEvidence } from "../exa";
import type { ToolDef } from "../reasoner-types";
import type { PipelineDeps, DepthDeps } from "./deps";
import { classifyEvidence } from "./classify";
import { expandQuery } from "./expand";
import { gatherDepth } from "./depth";
import { reciprocalRankFusion } from "./rrf";
import { isDeciding } from "./verdict";

// Days of slack around a claim's event date for the retrieval window. The lower bound cuts
// stale/unrelated older matches; the upper bound keeps the day-of and following-week
// primary reporting that actually settles a breaking-news claim, while excluding much later
// re-litigation. Fact-check outlets are excluded by domain regardless of date.
const WINDOW_BEFORE_DAYS = 30;
const WINDOW_AFTER_DAYS = 14;
const MS_PER_DAY = 86_400_000;

/** A centered publication window around a claim's event date, or undefined if no date is known. */
export function dateWindow(date?: string): SearchOptions | undefined {
  if (!date) return undefined;
  const t = Date.parse(date);
  if (Number.isNaN(t)) return undefined;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return {
    startPublishedDate: iso(t - WINDOW_BEFORE_DAYS * MS_PER_DAY),
    endPublishedDate: iso(t + WINDOW_AFTER_DAYS * MS_PER_DAY),
  };
}

// How many model↔search round-trips the gather loop may take before we stop and judge what
// we have. The model is told to keep searching until it has MIN_DECIDING reliable sources
// including one primary; this is the hard backstop on that model-driven loop.
const MAX_SEARCHES = 10;
const MIN_DECIDING = 2;

// The gather agent can emit several searches per turn, so the deduped pile behind one
// question routinely ran to dozens of sources — an illegible node and a needlessly long
// classify call. We keep only the most decision-relevant handful per question. This is the
// per-question analogue of the run-config legibility caps (claims / questions / sources).
const EVIDENCE_PER_QUESTION_CAP = 6;

// When the opt-in embedding re-rank (#57) is on, keep this many top candidates by cosine before
// classify — a pool wider than the final cap so the stated classify/quality rank still decides.
const RERANK_POOL = 10;

const GATHER_SYSTEM = `You are the evidence-gathering stage of VERITRACE, resolving ONE question about ONE claim de novo by searching the open web with the search_evidence tool.

How to search:
- Issue focused, standalone queries (keep the date / place / actor so keyword search anchors).
- KEEP SEARCHING until you have at least ${MIN_DECIDING} reliable sources that take a CLEAR stance on the claim, INCLUDING at least one PRIMARY source — the originating report, an official statement, or a news wire — not just re-reporting that echoes the viral claim.
- Vary the angle across calls: the event itself, whether authoritative sources confirm or contradict it, and the originating outlet. Don't repeat a query that already returned good results.
- Stop once the bar is met, or once reasonable queries are exhausted. Never fabricate — only the tool's results count.

When done, reply with a one-line summary of what you found.`;

const SEARCH_TOOL: ToolDef = {
  name: "search_evidence",
  description:
    "Search the open web for primary evidence answering the question. Returns up to a few sources (domain, title, dated passage). Call repeatedly with different focused queries.",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "A focused, standalone web query (include date/place/actor).",
      },
    },
    required: ["query"],
  },
};

/**
 * Tally of this question's web searches: how many ran and how many errored (#100). Search failures
 * are deliberately swallowed so one flaky query can't abort the run (#70) — but that also hides a
 * wholesale outage (credits exhausted, key revoked). The orchestrator sums these across the run to
 * tell "the web had no answer" (genuine NEI) apart from "retrieval itself was down" (all searches
 * errored). `lastError` carries one representative provider message for the surfaced warning.
 */
export interface RetrievalOutcome {
  searches: number;
  failures: number;
  lastError?: string;
}

/** What resolveQuestion returns: the classified evidence, the retrieval trace, and the search tally. */
export interface ResolvedQuestion {
  evidence: EvidenceItem[];
  trace: QuestionTrace;
  retrieval: RetrievalOutcome;
}

/**
 * Agentic retrieve (de novo) + classify for one question. The model drives a search loop —
 * issuing focused queries until it has ≥2 reliable sources incl. ≥1 primary, or MAX_SEARCHES
 * is hit — and we accumulate every retrieved source (deduped by url), then run the
 * deterministic classifier over the full set. We seed the loop with a HyDE-expanded query and
 * keep each search inside the claim's date window, so the model's judgment governs only *when
 * to stop searching* while the stated classify + verdict rules stay authoritative.
 *
 * Alongside the evidence we return a QuestionTrace — the HyDE seed, the exact queries issued,
 * and the loop's closing summary — so the UI can surface the normally-hidden retrieval steps.
 */
export async function resolveQuestion(
  claim: ClaimItem,
  question: QuestionItem,
  deps: PipelineDeps,
): Promise<ResolvedQuestion> {
  // Depth mode (#depth): swap the breadth fan-out below for a depth-first walk toward the origin.
  // Shares the same classify → cap → trace tail, so only the gather differs between the two modes.
  if (deps.depth) return resolveQuestionDepth(claim, question, { ...deps, depth: deps.depth });

  const window = dateWindow(claim.date);
  const collected = new Map<string, RawEvidence>();
  const searchQueries: string[] = [];
  // Count every search and its outcome so the orchestrator can spot a wholesale retrieval outage
  // (#100) — the failures below are otherwise swallowed (#70) and would masquerade as plain NEI.
  const retrieval: RetrievalOutcome = { searches: 0, failures: 0 };
  function recordSearchFailure(err: unknown) {
    retrieval.failures++;
    retrieval.lastError = err instanceof Error ? err.message : String(err);
  }

  async function onTool(name: string, input: unknown): Promise<unknown> {
    if (name !== "search_evidence") return { error: `unknown tool: ${name}` };
    const query = (input as { query?: string }).query ?? "";
    searchQueries.push(query); // record the actual executed queries for the trace
    retrieval.searches++;
    // Focus each source's highlight on the question being resolved, not the model's keyword
    // query — the highlight is the card excerpt, so this keeps it on-point.
    try {
      const results = await deps.search(query, { ...window, highlightQuery: question.text });
      for (const r of results) collected.set(r.url, r); // dedup by url across queries
      return results;
    } catch (err) {
      // A search failure (network timeout, Exa 5xx — even after retries) must NOT throw out of
      // the gather loop, which would abort this question and, via Promise.race, the whole run
      // (issue #70). Report it to the model so it can try another angle; the question resolves
      // on whatever else was gathered. Counted (above) so an all-failing run is still detectable.
      recordSearchFailure(err);
      return { error: `search failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  // RRF directional seed (#56, ADR 0008): issue one Exa query per directional hypothetical (plus
  // the bare question), then fuse the rankings with Reciprocal Rank Fusion — the live-search-API
  // analogue of HyDE/HerO's embedding-averaging (we fuse rankings, not vectors, so no embeddings).
  // A source ranked well across directions floats up; a one-query fluke washes out. The model then
  // drives follow-up searches over the same deduped pool.
  const { seed, hypothetical, anchors } = await expandQuery(claim, question, deps.ask);
  const seedQueries = [question.text, ...anchors];
  const seedRankings = await Promise.all(
    seedQueries.map((q) => {
      searchQueries.push(q);
      retrieval.searches++;
      return deps.search(q, { ...window, highlightQuery: question.text }).catch((err) => {
        recordSearchFailure(err);
        return [] as RawEvidence[];
      });
    }),
  );
  for (const r of reciprocalRankFusion(seedRankings, (e) => e.url)) collected.set(r.url, r);

  const result = await deps.ask.askWithTools(
    `Claim: "${claim.text}"\nQuestion: "${question.text}"\n\nA strong first query to run:\n${seed}\n\n${collected.size} source(s) were already retrieved by directional queries; search for MORE — especially a primary/originating source and the opposing stance.`,
    { system: GATHER_SYSTEM, tools: [SEARCH_TOOL], onTool, maxSteps: MAX_SEARCHES, maxTokens: 600 },
  );

  // Drop circular re-reporting that just restates the claim before paying to classify it.
  let gathered = dropClaimEchoes(claim.text, [...collected.values()]);
  // Opt-in embedding re-rank (#57, ADR 0010): when a reranker is wired, keep the candidates most
  // similar to the directional hypotheticals before classify. Absent ⇒ no embeddings (the default).
  if (deps.rerank) gathered = await deps.rerank.rerank(anchors, gathered, RERANK_POOL);
  const classified = await classifyEvidence(claim, question, gathered, deps.ask);
  const evidence = rankAndCapEvidence(classified, EVIDENCE_PER_QUESTION_CAP);
  const trace: QuestionTrace = {
    hydePassage: hypothetical,
    searchQueries,
    gatherSummary: result.text.trim(),
  };
  return { evidence, trace, retrieval };
}

/**
 * Depth-mode resolve: walk the claim toward its origin (gatherDepth) instead of fanning out, then
 * run the SAME echo-filter → (optional rerank) → classify → cap tail as the breadth path, so the
 * verdict rules stay identical and only the gather differs. We re-attach each source's hop index
 * (`depth`) onto the classified evidence by URL, and record the walk on the trace so the chain from
 * echo to origin is observable. The HyDE hypothetical still seeds the first search and rides the
 * trace; the walk takes over from there.
 */
async function resolveQuestionDepth(
  claim: ClaimItem,
  question: QuestionItem,
  deps: PipelineDeps & { depth: DepthDeps },
): Promise<ResolvedQuestion> {
  const window = dateWindow(claim.date);
  const { seed, hypothetical } = await expandQuery(claim, question, deps.ask);

  const { gathered, depthByUrl, walk, queries, summary, retrieval } = await gatherDepth(
    claim,
    question,
    seed,
    window,
    deps,
  );

  let candidates = dropClaimEchoes(claim.text, gathered);
  if (deps.rerank) candidates = await deps.rerank.rerank([seed], candidates, RERANK_POOL);
  const classified = await classifyEvidence(claim, question, candidates, deps.ask);
  // Re-attach the walk's hop index by URL (classify preserves url) so the spiral can order the
  // chain; sources the echo-filter/cap dropped simply fall away with their depth.
  const withDepth = classified.map((e) => ({ ...e, depth: depthByUrl.get(e.url) }));
  const evidence = rankAndCapEvidence(withDepth, EVIDENCE_PER_QUESTION_CAP);

  const trace: QuestionTrace = {
    hydePassage: hypothetical,
    searchQueries: queries,
    gatherSummary: summary,
    walk,
  };
  return { evidence, trace, retrieval };
}

// Claim-echo filter (HerO reranking.py: drop a passage when the claim is >92% of it). Circular
// "evidence" — re-reporting that merely restates the viral claim without verifying it — wastes
// classify tokens and can masquerade as support. We catch the blatant case mechanically before
// classification, as a cheap complement to (not a replacement for) the classifier's skepticism.
// No embeddings in the critical path, so we use token-Jaccard instead of HerO's cosine.
const ECHO_JACCARD = 0.9; // near-identical token sets only — very conservative
const ECHO_MAX_LEN_RATIO = 1.4; // a passage much longer than the claim has room to verify; keep it

// Verification/stance cues. A passage that adds any of these is doing work the claim doesn't —
// quoting then refuting/confirming — so it survives regardless of overlap, even for long claims
// where one appended word barely moves Jaccard. (issue #14: never drop a quote-then-refute.)
const VERIFY_CUES = new Set([
  "false",
  "fake",
  "hoax",
  "debunked",
  "debunk",
  "misleading",
  "incorrect",
  "untrue",
  "baseless",
  "unfounded",
  "denied",
  "denies",
  "deny",
  "no",
  "not",
  "never",
  "confirmed",
  "confirms",
  "verified",
  "true",
  "correct",
  "actually",
  "however",
  "but",
  "despite",
  "contrary",
  "misinformation",
  "disinformation",
  "rumor",
  "rumour",
  "satire",
  "fabricated",
  "doctored",
  "manipulated",
  "context",
  "according",
  "reportedly",
  "alleged",
  "allegedly",
]);

function echoTokens(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Drop retrieved evidence whose excerpt is a near-duplicate of the claim — circular "evidence"
 * that just restates the claim. Pure. Conservative on purpose: a passage is removed only when it
 * is SHORT (≈ the claim's length), shares ≥ ECHO_JACCARD of its tokens with the claim, and adds
 * NO verification cue. A long article that quotes the claim, or a short quote-then-refute, both
 * survive — so this never costs us a real source.
 */
export function dropClaimEchoes(claimText: string, evidence: RawEvidence[]): RawEvidence[] {
  const claimToks = echoTokens(claimText);
  if (claimToks.length === 0) return evidence; // nothing to compare against
  const claimSet = new Set(claimToks);

  return evidence.filter((e) => {
    const passToks = echoTokens(e.passage || e.text);
    if (passToks.length === 0) return true;
    if (passToks.length > claimToks.length * ECHO_MAX_LEN_RATIO) return true; // long enough to verify
    if (passToks.some((t) => !claimSet.has(t) && VERIFY_CUES.has(t))) return true; // does real work
    return jaccard(claimSet, new Set(passToks)) < ECHO_JACCARD; // keep when NOT a near-duplicate
  });
}

const RELIABILITY_RANK: Record<EvidenceItem["reliability"], number> = {
  high: 2,
  medium: 1,
  low: 0,
};

/** Decision-relevance score: deciding evidence first, then reliability, clear stance, confidence. */
function evidenceScore(e: EvidenceItem): number {
  const deciding = isDeciding(e) ? 1 : 0;
  const clearStance = e.stance === "contextualizes" ? 0 : 1;
  return (
    deciding * 100 +
    RELIABILITY_RANK[e.reliability] * 10 +
    clearStance * 5 +
    (e.stanceConfidence ?? 0)
  );
}

/**
 * Keep only the most decision-relevant `limit` evidence items for one question, so a node
 * stays legible. Verdict-preserving: the top deciding `supports` and `refutes` are pinned to
 * the front before the cap, so a lone refutation can't be crowded out by a wall of supports
 * (which would silently flip a Conflicting claim to Supported). Pure — no side effects.
 */
export function rankAndCapEvidence(evidence: EvidenceItem[], limit: number): EvidenceItem[] {
  if (evidence.length <= limit) return evidence;
  const ranked = [...evidence].sort((a, b) => evidenceScore(b) - evidenceScore(a));

  const pinned: EvidenceItem[] = [];
  for (const stance of ["supports", "refutes"] as const) {
    const best = ranked.find((e) => e.stance === stance && isDeciding(e));
    if (best) pinned.push(best);
  }
  const rest = ranked.filter((e) => !pinned.includes(e));
  return [...pinned, ...rest].slice(0, limit);
}

/** A one-line advisory "why" — composed from the deciding evidence, never asserted as truth. */
export function rationaleFor(claim: ClaimItem, verdict: Verdict, evidence: EvidenceItem[]): string {
  if (!claim.checkable) {
    return "Rests on imagery or media provenance this text-only build cannot verify.";
  }
  if (claim.checkworthy === false) {
    return "Subjective or opinion statement — not a checkable factual assertion.";
  }
  if (verdict === "nei") {
    // Make the insufficiency self-explaining (Kotonya & Toni; CLUE): say WHY, not just NEI.
    if (evidence.length === 0) {
      return "No primary sources answered this claim's questions.";
    }
    // Echo-chamber abstention (#51): reliable sources were found, but every deciding one is
    // re-reporting — no originating source — so the verdict abstains rather than trust the echo.
    const deciding = evidence.filter(isDeciding);
    if (deciding.length > 0 && !deciding.some((e) => e.sourceType === "primary")) {
      const d = uniqueDomains(deciding);
      return `Found ${deciding.length} reliable source${deciding.length === 1 ? "" : "s"} (${d}) but all are re-reporting — no primary/originating source to establish the claim.`;
    }
    const found = uniqueDomains(evidence);
    const n = evidence.length;
    return `Found ${n} source${n === 1 ? "" : "s"} (${found}) but none cleared the reliability and clarity bar.`;
  }
  const deciding = pickDeciding(verdict, evidence);
  const domains = uniqueDomains(deciding);
  // Surface whether we actually reached an originating source — the heart of the de-novo
  // promise — without letting it gate the verdict (reliability still decides that).
  const provenance = deciding.some((e) => e.sourceType === "primary")
    ? "incl. a primary source"
    : "re-reporting only, no originating source located";
  switch (verdict) {
    case "supported":
      return `Supported by ${domains} — ${provenance}.`;
    case "refuted":
      return `Refuted by ${domains} — ${provenance}.`;
    case "conflicting":
      return `Sources conflict — both supporting and refuting evidence found (${domains}), ${provenance}.`;
    default:
      return "";
  }
}

function pickDeciding(verdict: Verdict, evidence: EvidenceItem[]): EvidenceItem[] {
  if (verdict === "supported") return evidence.filter((e) => e.stance === "supports");
  if (verdict === "refuted") return evidence.filter((e) => e.stance === "refutes");
  return evidence;
}

function uniqueDomains(evidence: EvidenceItem[]): string {
  const domains = [...new Set(evidence.map((e) => e.domain))];
  if (domains.length === 0) return "the retrieved sources";
  if (domains.length <= 2) return domains.join(" and ");
  return `${domains.slice(0, 2).join(", ")} and others`;
}
