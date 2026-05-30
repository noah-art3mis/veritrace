import type { AnthropicCaller } from "../anthropic";
import type { ClaimItem, QuestionItem } from "../graph-types";

// Legibility cap (PLAN.md): ~2 questions per claim.
const MAX_QUESTIONS = 2;

const SYSTEM = `You are the question-generation stage of VERITRACE. Given one atomic claim, produce the specific questions a professional fact-checker would ask to resolve it — the questions whose answers (from primary sources) would settle whether the claim is Supported, Refuted, or Conflicting. The QA-pair (question → answering evidence) IS the explanation shown to the user, per AVeriTeC.

Rules:
- At most ${MAX_QUESTIONS} questions, each independently searchable on the open web (include the date/place/actor from the claim so the question stands alone).
- Prefer questions that primary sources (news wires, official statements, registries) can answer. For a claim that could be an official-denial type, ask both the existence question AND whether authorities confirmed or denied it.
- Plain, neutral phrasing. No leading questions.

Respond with ONLY a JSON array of strings, no prose:
["<question 1>", "<question 2>"]`;

export async function generateQuestions(
  claim: ClaimItem,
  ask: AnthropicCaller,
): Promise<QuestionItem[]> {
  // Unverifiable-by-text claims and non-checkworthy (opinion/subjective) claims get no
  // questions — both resolve to NEI by design without consuming a search.
  if (!claim.checkable || claim.checkworthy === false) return [];

  const questions = await ask.askJSON<string[]>(
    `Claim: "${claim.text}"\n\nGenerate the resolving questions.`,
    { system: SYSTEM, maxTokens: 600 },
  );

  return questions.slice(0, MAX_QUESTIONS).map((text, i) => ({
    id: `${claim.id}-q${i + 1}`,
    claimId: claim.id,
    text,
    status: "pending" as const,
  }));
}
