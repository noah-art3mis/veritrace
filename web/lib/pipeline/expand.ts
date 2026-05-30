import type { AnthropicCaller } from "../anthropic";
import type { ClaimItem, QuestionItem } from "../graph-types";

// HyDE-style query expansion (HerO / HerO2). Retrieval is the documented bottleneck of
// open-web fact-checking; searching the bare question misses sources that phrase the fact
// differently. We synthesize a short *hypothetical* primary-source passage that would
// answer the question and append it to the query, so dense retrieval matches on the shape
// of the ideal evidence — while keeping the literal question text so keyword anchors
// (names, dates, places) still bind.
//
// Guardrail: the hypothetical must NOT take a side. If it asserts the claim is true, it
// biases retrieval toward confirmation. The prompt forbids a verdict; it describes the
// kind of report that would settle the question, neutrally.

const SYSTEM = `You are the retrieval-expansion stage of VERITRACE (HyDE). Given a claim and one question being asked to resolve it, write a SHORT (1–2 sentence) hypothetical passage in the style of the primary source — a news-wire report or official statement — that would ANSWER the question. This text only steers web retrieval; it is never shown as evidence.

Rules:
- DO NOT decide whether the claim is true or false, and do not invent a specific outcome. Write neutrally about the kind of report that would answer the question. Asserting the verdict here biases the search toward confirmation.
- Keep the real entities, date, and place from the claim so keyword search still anchors.
- Plain declarative prose. Output ONLY the passage, no preamble or quotes.`;

/** Build the retrieval query for a question: the question text plus a neutral hypothetical answer. */
export async function expandQuery(
  claim: ClaimItem,
  question: QuestionItem,
  ask: AnthropicCaller,
): Promise<string> {
  const hypothetical = await ask.askText(
    `Claim: "${claim.text}"\nQuestion: "${question.text}"\n\nWrite the hypothetical evidence passage.`,
    { system: SYSTEM, maxTokens: 200 },
  );
  const hint = hypothetical.trim();
  return hint ? `${question.text}\n${hint}` : question.text;
}
