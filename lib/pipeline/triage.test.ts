import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReasoningProvider } from "../reasoner-types";
import type { Utterance } from "./segment";
import { isSearchable } from "./claim-status";

const askJSON = vi.fn();
const ask: ReasoningProvider = { askJSON, askText: vi.fn(), askWithTools: vi.fn() };

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
      { text: "Springfield is a city.", checkable: true, checkworthy: true, relevance: 0 },
      {
        text: "Immigrants in Springfield are eating residents' pets.",
        checkable: true,
        checkworthy: true,
        relevance: 0.8,
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

  it("anchors the date to a provided asOf and seeds it when the model returns null", async () => {
    // Feeding a decontextualised claim with no in-text date (an eval gold), we pass the known
    // claim date as asOf. It must become the model's "Today's date" anchor (so a 2020 claim
    // isn't anchored to the real today) AND backfill a null model date — otherwise retrieval
    // would be unwindowed and leak post-claim sources.
    askJSON.mockResolvedValue([{ text: "a", date: null }]);
    const claims = await triageUtterances("src", [u("a")], ask, 5, "2020-10-15");
    expect(askJSON.mock.calls[0][0]).toContain("Today's date: 2020-10-15");
    expect(claims[0].date).toBe("2020-10-15");
  });

  it("prefers the model's specific date over asOf when the model supplies one", async () => {
    askJSON.mockResolvedValue([{ text: "a", date: "2020-10-20" }]);
    const claims = await triageUtterances("src", [u("a")], ask, 5, "2020-10-15");
    expect(claims[0].date).toBe("2020-10-20");
  });

  it("keeps the highest-relevance claims when over maxClaims, not the first ones", async () => {
    askJSON.mockResolvedValue([
      { text: "low", checkable: true, checkworthy: true, relevance: 0.2 },
      { text: "high", checkable: true, checkworthy: true, relevance: 0.9 },
      { text: "mid", checkable: true, checkworthy: true, relevance: 0.5 },
      { text: "high2", checkable: true, checkworthy: true, relevance: 0.8 },
    ]);
    const claims = await triageUtterances("src", [u("a"), u("b"), u("c"), u("d")], ask, 2);
    // top-2 by relevance are "high" (0.9, idx 1) and "high2" (0.8, idx 3) — NOT the first two.
    expect(claims.filter(isSearchable)).toHaveLength(2);
    expect(claims[1].relevant).toBe(true);
    expect(claims[3].relevant).toBe(true);
    expect(claims[0].relevant).toBe(false);
    expect(claims[2].relevant).toBe(false);
  });

  it("drops zero-relevance background claims even when under the cap", async () => {
    askJSON.mockResolvedValue([
      { text: "background", checkable: true, checkworthy: true, relevance: 0 },
      { text: "real", checkable: true, checkworthy: true, relevance: 0.7 },
    ]);
    const claims = await triageUtterances("src", [u("a"), u("b")], ask, 5);
    expect(claims[0].relevant).toBe(false);
    expect(claims[1].relevant).toBe(true);
  });

  it("demotes a low-but-nonzero background premise below the floor, even under the cap (#52)", async () => {
    // The Imran-Khan miss: a true-but-irrelevant background premise ("X criticized Y") scored as
    // mildly relevant rode alongside the contested numbers and flipped the document to conflicting.
    // A barely-relevant premise must be dropped even when there's room under maxClaims.
    askJSON.mockResolvedValue([
      { text: "Imran Khan criticized Macron.", checkable: true, checkworthy: true, relevance: 0.2 },
      { text: "183 visas were cancelled.", checkable: true, checkworthy: true, relevance: 0.9 },
    ]);
    const claims = await triageUtterances("src", [u("a"), u("b")], ask, 5);
    expect(claims[0].relevant).toBe(false); // background premise dropped by the floor
    expect(claims[1].relevant).toBe(true); // contested numeric claim kept
  });

  it("keeps a mid-range secondary-but-real claim above the floor", async () => {
    askJSON.mockResolvedValue([
      { text: "a real secondary claim", checkable: true, checkworthy: true, relevance: 0.4 },
    ]);
    const [c] = await triageUtterances("src", [u("a")], ask, 5);
    expect(c.relevant).toBe(true);
  });

  it("carries the relevance score onto the claim for display", async () => {
    askJSON.mockResolvedValue([{ text: "x", checkable: true, checkworthy: true, relevance: 0.6 }]);
    const [c] = await triageUtterances("src", [u("a")], ask, 5);
    expect(c.relevanceScore).toBe(0.6);
  });

  it("does not let an unsearchable claim consume a cap slot", async () => {
    askJSON.mockResolvedValue([
      { text: "media claim", checkable: false, checkworthy: true, relevance: 0.9 },
      { text: "real one", checkable: true, checkworthy: true, relevance: 0.7 },
      { text: "real two", checkable: true, checkworthy: true, relevance: 0.6 },
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
