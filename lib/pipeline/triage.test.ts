import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AnthropicCaller } from "../anthropic";
import type { Utterance } from "./segment";
import { isSearchable } from "./claim-status";

const askJSON = vi.fn();
const ask: AnthropicCaller = { askJSON, askText: vi.fn(), askWithTools: vi.fn() };

import { triageUtterances } from "./triage";

beforeEach(() => askJSON.mockReset());

function u(text: string, original = "o"): Utterance {
  return { text, original };
}

describe("triageUtterances", () => {
  it("returns nothing and skips the model when there are no utterances", async () => {
    expect(await triageUtterances("src", [], ask, 5)).toEqual([]);
    expect(askJSON).not.toHaveBeenCalled();
  });

  it("assigns sequential ids, null verdicts, and pairs decontextualized text with the source fragment", async () => {
    askJSON.mockResolvedValue([
      { text: "Springfield is a city.", checkable: true, checkworthy: true, relevant: false },
      {
        text: "Immigrants in Springfield are eating residents' pets.",
        checkable: true,
        checkworthy: true,
        relevant: true,
      },
    ]);
    const claims = await triageUtterances(
      "src",
      [u("Springfield is a city", "In Springfield"), u("eating the pets", "eating the pets")],
      ask,
      5,
    );
    expect(claims.map((c) => c.id)).toEqual(["c1", "c2"]);
    expect(claims.every((c) => c.verdict === null)).toBe(true);
    expect(claims[0]).toMatchObject({
      text: "Springfield is a city.",
      original: "In Springfield",
      relevant: false,
    });
    expect(claims[1].original).toBe("eating the pets");
  });

  it("defaults checkable/checkworthy/relevant to true when the model omits them", async () => {
    askJSON.mockResolvedValue([{ text: "decontextualized" }]);
    const [c] = await triageUtterances("src", [u("raw")], ask, 5);
    expect(c.checkable).toBe(true);
    expect(c.checkworthy).toBe(true);
    expect(c.relevant).toBe(true);
  });

  it("carries the event date through and leaves it undefined when null", async () => {
    askJSON.mockResolvedValue([
      { text: "a", date: "2026-02-22" },
      { text: "b", date: null },
    ]);
    const claims = await triageUtterances("src", [u("a"), u("b")], ask, 5);
    expect(claims[0].date).toBe("2026-02-22");
    expect(claims[1].date).toBeUndefined();
  });

  it("caps searchable claims at maxClaims, demoting the overflow to not-relevant", async () => {
    askJSON.mockResolvedValue(
      Array.from({ length: 4 }, (_, i) => ({
        text: `c${i}`,
        checkable: true,
        checkworthy: true,
        relevant: true,
      })),
    );
    const claims = await triageUtterances("src", [u("a"), u("b"), u("c"), u("d")], ask, 2);
    expect(claims.filter(isSearchable)).toHaveLength(2);
    expect(claims[0].relevant).toBe(true);
    expect(claims[1].relevant).toBe(true);
    expect(claims[2].relevant).toBe(false);
    expect(claims[3].relevant).toBe(false);
  });

  it("does not let an unsearchable claim consume a cap slot", async () => {
    askJSON.mockResolvedValue([
      { text: "media claim", checkable: false, checkworthy: true, relevant: true },
      { text: "real one", checkable: true, checkworthy: true, relevant: true },
      { text: "real two", checkable: true, checkworthy: true, relevant: true },
    ]);
    const claims = await triageUtterances("src", [u("a"), u("b"), u("c")], ask, 2);
    // The uncheckable claim doesn't eat a slot, so both real claims stay searchable.
    expect(claims.filter(isSearchable)).toHaveLength(2);
    expect(claims[1].relevant).toBe(true);
    expect(claims[2].relevant).toBe(true);
  });

  it("flags decontextualizer-injected specifics absent from the source", async () => {
    askJSON.mockResolvedValue([
      { text: "The Blackpink album was released in 2018.", checkable: true },
    ]);
    const [c] = await triageUtterances("The album was released in 2018.", [u("The album")], ask, 5);
    expect(c.injected).toContain("Blackpink");
  });

  it("embeds the source text and the utterances in the prompt", async () => {
    askJSON.mockResolvedValue([{ text: "x" }]);
    await triageUtterances("THE SOURCE", [u("AN UTTERANCE")], ask, 5);
    const prompt = askJSON.mock.calls[0][0];
    expect(prompt).toContain("THE SOURCE");
    expect(prompt).toContain("AN UTTERANCE");
  });
});
