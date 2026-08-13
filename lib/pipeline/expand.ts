import type { ReasoningProvider } from "../reasoner-types";
import type { ClaimItem, QuestionItem } from "../graph-types";

// HyDE-style query expansion (HyDE: Gao et al. 2022; applied to fact-checking by HerO, 2024 —
// see docs/papers/). Retrieval is the documented bottleneck of open-web fact-checking; searching
// the bare question misses sources that phrase the fact differently. We synthesize short
// *hypothetical* primary-source passages that would answer the question and append them to the
// query, so retrieval matches on the shape of the ideal evidence — while keeping the literal
// question text so keyword anchors (names, dates, places) still bind.
//
// Two-sided confirm/refute split (#13) — OUR design, not HerO's. HyDE samples N passages from a
// SINGLE open-ended prompt and averages their embeddings; HerO does the same (N=8) over a fixed
// corpus. Neither shapes opposing stances — HyDE explicitly leaves stance diversity "to future
// work". We have no embeddings and no controlled corpus (we query a live search API), so instead
// we generate TWO directional anchors — one that would CONFIRM, one that would REFUTE — and seed
// the gather loop with both. Writing both directions asserts NEITHER verdict; balanced coverage
// across directions is our anti-bias mechanism, and a refute-shaped anchor is a stronger retrieval
// magnet for genuine counter-evidence than a single neutral passage. (Fusing the two queries by
// reciprocal rank is tracked in #56.)

const SYSTEM = `You are the retrieval-expansion stage of VERITRACE (HyDE). Given a claim and one question being asked to resolve it, write TWO short hypothetical passages in the style of the primary source — a news-wire report or official statement — that would ANSWER the question, one in each direction. This text only steers web retrieval; it is never shown as evidence and is never a verdict.

Write EXACTLY two lines, no labels, no preamble, no quotes:
- Line 1 — shaped like the primary source that would CONFIRM the claim (e.g. a wire report or official statement affirming the event happened).
- Line 2 — shaped like the primary source that would REFUTE it (e.g. reporting that it did not happen, or an authoritative source contradicting it).

Writing both directions is NOT deciding the claim is true or false — it casts a balanced retrieval net so a real confirming OR refuting primary source can be found if it exists. Keep the real entities, date, and place from the claim in both lines so keyword search still anchors. Plain declarative prose.`;

/** The HyDE expansion: the seed query sent to retrieval, plus the hypotheticals (for the trace). */
export interface ExpandedQuery {
  seed: string; // question text + both directional hypotheticals — what actually steers retrieval
  hypothetical: string; // the directional passages, labelled, for the surfaced trace ("" if none)
  anchors: string[]; // the directional passages as standalone queries — one per hypothetical, for RRF (#56)
}

const TRACE_LABELS = ["would confirm", "would refute"];

/** Build the retrieval query for a question: the question text plus confirm- and refute-shaped anchors. */
export async function expandQuery(
  claim: ClaimItem,
  question: QuestionItem,
  ask: ReasoningProvider,
): Promise<ExpandedQuery> {
  const raw = await ask.askText(
    `Claim: "${claim.text}"\nQuestion: "${question.text}"\n\nWrite the two directional hypothetical passages.`,
    { system: SYSTEM, maxTokens: 300 },
  );

  // Take the first two non-empty lines as the confirm/refute anchors. Robust to the model
  // adding a stray blank line or a leading "Line 1:" / "Support:" style label.
  const passages = raw
    .split("\n")
    .map((l) =>
      l.replace(/^\s*(?:line\s*\d+|support|confirm|refute|deny)\s*[:.)\-–]\s*/i, "").trim(),
    )
    .filter(Boolean)
    .slice(0, 2);

  const seed = passages.length ? `${question.text}\n${passages.join("\n")}` : question.text;
  const hypothetical = passages.map((p, i) => `${TRACE_LABELS[i] ?? "also"}: ${p}`).join("\n");
  // Each directional passage is also a standalone retrieval query (it carries the entities/date),
  // so resolveQuestion can issue one Exa search per hypothetical and RRF-fuse the rankings (#56).
  return { seed, hypothetical, anchors: passages };
}
