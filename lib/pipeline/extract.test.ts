import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReasoningProvider } from "../reasoner-types";
import { isSearchable } from "./claim-status";

const askJSON = vi.fn();
const ask: ReasoningProvider = { askJSON, askText: vi.fn(), askWithTools: vi.fn() };

import { extractClaims } from "./extract";

beforeEach(() => askJSON.mockReset());

// extractClaims is the SEGMENT -> TRIAGE orchestrator; the per-stage behavior is pinned in
// segment.test.ts / triage.test.ts. These tests cover the wiring between the two passes.
describe("extractClaims", () => {
  it("segments then triages, pairing decontextualized text with the original fragment", async () => {
    askJSON
      .mockResolvedValueOnce([{ text: "raw utterance", original: "frag" }]) // segment
      .mockResolvedValueOnce([{ text: "decontextualized claim", relevant: true }]); // triage

    const claims = await extractClaims("source", ask, 5);

    expect(askJSON).toHaveBeenCalledTimes(2);
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({
      id: "c1",
      text: "decontextualized claim",
      original: "frag",
      verdict: null,
    });
  });

  it("skips triage entirely when segmentation finds nothing", async () => {
    askJSON.mockResolvedValueOnce([]); // segment yields no utterances
    expect(await extractClaims("source", ask, 5)).toEqual([]);
    expect(askJSON).toHaveBeenCalledTimes(1);
  });

  it("threads maxClaims through to the relevance cap", async () => {
    askJSON
      .mockResolvedValueOnce(
        Array.from({ length: 4 }, (_, i) => ({ text: `u${i}`, original: "o" })),
      )
      .mockResolvedValueOnce(
        Array.from({ length: 4 }, (_, i) => ({
          text: `c${i}`,
          checkable: true,
          checkworthy: true,
          relevant: true,
        })),
      );
    const claims = await extractClaims("source", ask, 2);
    expect(claims).toHaveLength(4); // full decomposition is preserved
    expect(claims.filter(isSearchable)).toHaveLength(2); // but only maxClaims are checked
  });
});
