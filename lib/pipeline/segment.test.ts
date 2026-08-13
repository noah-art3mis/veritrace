import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReasoningProvider } from "../reasoner-types";

const askJSON = vi.fn();
const ask: ReasoningProvider = { askJSON, askText: vi.fn(), askWithTools: vi.fn() };

import { segmentUtterances, SEGMENT_CEILING } from "./segment";

beforeEach(() => askJSON.mockReset());

describe("segmentUtterances", () => {
  it("returns each atomic utterance with its source fragment", async () => {
    askJSON.mockResolvedValue([
      { text: "Springfield is a city.", original: "In Springfield" },
      { text: "Immigrants live in Springfield.", original: "they're eating the dogs" },
    ]);
    const out = await segmentUtterances("In Springfield, they're eating the dogs.", ask);
    expect(out).toEqual([
      { text: "Springfield is a city.", original: "In Springfield" },
      { text: "Immigrants live in Springfield.", original: "they're eating the dogs" },
    ]);
  });

  it("embeds the source text in the prompt", async () => {
    askJSON.mockResolvedValue([]);
    await segmentUtterances("THE VIRAL POST", ask);
    expect(askJSON.mock.calls[0][0]).toContain("THE VIRAL POST");
  });

  it("caps the split at the ceiling so a long article cannot explode the graph", async () => {
    askJSON.mockResolvedValue(
      Array.from({ length: SEGMENT_CEILING + 8 }, (_, i) => ({ text: `u${i}`, original: "o" })),
    );
    expect(await segmentUtterances("long", ask)).toHaveLength(SEGMENT_CEILING);
  });

  it("drops malformed entries with no text rather than emitting empty utterances", async () => {
    askJSON.mockResolvedValue([
      { text: "real utterance", original: "frag" },
      { text: "", original: "frag" },
      { original: "frag" },
    ]);
    const out = await segmentUtterances("src", ask);
    expect(out).toEqual([{ text: "real utterance", original: "frag" }]);
  });
});
