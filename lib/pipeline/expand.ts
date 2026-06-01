import type { AnthropicCaller } from "../anthropic";
import type { ClaimItem, QuestionItem } from "../graph-types";

// HyDE-style query expansion (HerO / HerO2). Retrieval is the documented bottleneck of
// open-web fact-checking; searching the bare question misses sources that phrase the fact
// differently. We synthesize short *hypothetical* primary-source passages that would answer
// the question and append them to the query, so dense retrieval matches on the shape of the
// ideal evidence — while keeping the literal question text so keyword anchors (names, dates,
// places) still bind.
//
// Stance-shaped, not neutral (#13). HerO achieves anti-bias through COVERAGE of every stance,
// not neutrality: it writes passages shaped to confirm AND to refute and averages them. We have
// no embeddings in the critical path, so instead we generate two directional anchors — one
// shaped like a source that would CONFIRM, one shaped like an official DENIAL — and seed the
// gather loop with both. A denial-shaped anchor is a far stronger retrieval magnet for an actual
// government denial than a neutral "a report would describe whether authorities confirmed…", and
// the official-denial claim is our hero case. Writing both directions asserts NEITHER verdict —
// balanced coverage across directions is the anti-bias mechanism that replaces single-neutral.

const SYSTEM = `You are the retrieval-expansion stage of VERITRACE (HyDE). Given a claim and one question being asked to resolve it, write TWO short hypothetical passages in the style of the primary source — a news-wire report or official statement — that would ANSWER the question, one in each direction. This text only steers web retrieval; it is never shown as evidence and is never a verdict.

Write EXACTLY two lines, no labels, no preamble, no quotes:
- Line 1 — shaped like the primary source that would CONFIRM the claim (a wire report or official statement affirming the event happened).
- Line 2 — shaped like the primary source that would REFUTE it (an official denial issued after the event date, or reporting that it did not happen).

Writing both directions is NOT deciding the claim is true or false — it casts a balanced retrieval net so a real confirming OR denying primary source can be found if it exists. Keep the real entities, date, and place from the claim in both lines so keyword search still anchors. Plain declarative prose.`;

/** The HyDE expansion: the seed query sent to retrieval, plus the hypotheticals (for the trace). */
export interface ExpandedQuery {
  seed: string; // question text + both directional hypotheticals — what actually steers retrieval
  hypothetical: string; // the directional passages, labelled, for the surfaced trace ("" if none)
}

const TRACE_LABELS = ["would confirm", "would refute"];

/** Build the retrieval query for a question: the question text plus confirm- and refute-shaped anchors. */
export async function expandQuery(
  claim: ClaimItem,
  question: QuestionItem,
  ask: AnthropicCaller,
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
  return { seed, hypothetical };
}
