import { describe, it, expect } from "vitest";
import { createReasoner } from "../reasoner";
import { DEFAULT_CONFIG } from "../run-config";
import { segmentUtterances } from "./segment";

// LIVE MODEL EVAL. Segmentation is an LLM decision — whether "A ou B" splits into two
// candidate claims lives entirely in the model + prompt, so a mocked test proves nothing.
// This calls the real model and is auto-SKIPPED when no key is present. To run it locally,
// expose your key to the shell first, e.g.:
//   ! export $(grep OPENROUTER_API_KEY .env.local) && npx vitest run lib/pipeline/segment.eval
const hasKey = !!process.env.OPENROUTER_API_KEY;

describe.skipIf(!hasKey)("segmentUtterances (live eval)", () => {
  it("splits a 'Lula ou Bolsonaro' disjunction into one candidate claim per alternative", async () => {
    const ask = createReasoner(DEFAULT_CONFIG);
    const out = await segmentUtterances(
      "shakira declarou apoio a lula ou a bolsonaro durante show no rio",
      ask,
    );

    // Each endorsement must be its OWN utterance — not a single "Lula or Bolsonaro" line —
    // so the checker can verify them independently (at most one can be true).
    const lulaOnly = out.some((u) => /lula/i.test(u.text) && !/bolsonaro/i.test(u.text));
    const bolsonaroOnly = out.some((u) => /bolsonaro/i.test(u.text) && !/lula/i.test(u.text));

    expect(lulaOnly, `expected a Lula-only utterance in: ${JSON.stringify(out)}`).toBe(true);
    expect(bolsonaroOnly, `expected a Bolsonaro-only utterance in: ${JSON.stringify(out)}`).toBe(
      true,
    );
  }, 30_000);
});
