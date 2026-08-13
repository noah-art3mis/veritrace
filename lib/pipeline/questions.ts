import type { ReasoningProvider } from "../reasoner-types";
import type { ClaimItem, QuestionItem } from "../graph-types";
import { isSearchable } from "./claim-status";

// The per-claim question cap is a per-run legibility setting (RunConfig.maxQuestions); the
// system prompt is templated with it so the model and the hard slice below agree.
const systemPrompt = (maxQuestions: number) =>
  `You are the question-generation stage of VERITRACE. Given one atomic claim, produce the specific questions a professional fact-checker would ask to resolve it — the questions whose answers (from primary sources) would settle whether the claim is Supported, Refuted, or Conflicting. The QA-pair (question → answering evidence) IS the explanation shown to the user, per AVeriTeC.

Rules:
- At most ${maxQuestions} question${maxQuestions === 1 ? "" : "s"}, each independently searchable on the open web (include the date/place/actor from the claim so the question stands alone).
- Prefer questions that primary sources (news wires, official statements, registries) can answer. For a contested event claim, cover more than one angle — e.g. whether the event occurred and whether it was subsequently confirmed or contradicted — so retrieval isn't biased toward a single framing.
- Plain, neutral phrasing. No leading questions.

Respond with ONLY a JSON array of strings, no prose:
["<question 1>"${maxQuestions === 1 ? "" : ', "<question 2>"'}]`;

export async function generateQuestions(
  claim: ClaimItem,
  ask: ReasoningProvider,
  maxQuestions: number,
): Promise<QuestionItem[]> {
  // Only searchable claims get questions: relevance-dropped (trivial background),
  // unverifiable-by-text, and non-checkworthy (opinion) claims all skip retrieval.
  if (!isSearchable(claim)) return [];

  const questions = await ask.askJSON<string[]>(
    `Claim: "${claim.text}"\n\nGenerate the resolving questions.`,
    { system: systemPrompt(maxQuestions), maxTokens: 600 },
  );

  return questions.slice(0, maxQuestions).map((text, i) => ({
    id: `${claim.id}-q${i + 1}`,
    claimId: claim.id,
    text,
    status: "pending" as const,
  }));
}
