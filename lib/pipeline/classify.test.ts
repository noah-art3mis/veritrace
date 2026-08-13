import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReasoningProvider } from "../reasoner-types";

const askJSON = vi.fn();
const ask: ReasoningProvider = { askJSON, askText: vi.fn(), askWithTools: vi.fn() };

import { classifyEvidence } from "./classify";
import type { ClaimItem, QuestionItem } from "../graph-types";
import type { RawEvidence } from "../exa";

const claim: ClaimItem = { id: "c1", text: "claim", checkable: true, verdict: null };
const question: QuestionItem = { id: "c1-q1", claimId: "c1", text: "q?", status: "searching" };

function raw(over: Partial<RawEvidence> = {}): RawEvidence {
  return {
    title: "Title",
    url: "https://bbc.com/x",
    domain: "bbc.com",
    faviconUrl: "https://bbc.com/fav.ico",
    publishedDate: "2026-02-22",
    passage: "a passage",
    text: "a passage",
    ...over,
  };
}

beforeEach(() => askJSON.mockReset());

describe("classifyEvidence", () => {
  it("returns nothing and skips the model when there is no raw evidence", async () => {
    const out = await classifyEvidence(claim, question, [], ask);
    expect(out).toEqual([]);
    expect(askJSON).not.toHaveBeenCalled();
  });

  it("zips classifications onto raw sources positionally", async () => {
    askJSON.mockResolvedValue([
      { stance: "supports", reliability: "high", sourceType: "primary", stanceConfidence: 0.9 },
      { stance: "refutes", reliability: "medium", sourceType: "secondary", stanceConfidence: 0.7 },
    ]);
    const out = await classifyEvidence(
      claim,
      question,
      [raw({ domain: "a.com" }), raw({ domain: "b.com" })],
      ask,
    );
    expect(out[0]).toMatchObject({ domain: "a.com", stance: "supports", reliability: "high" });
    expect(out[1]).toMatchObject({ domain: "b.com", stance: "refutes", reliability: "medium" });
  });

  it("generates evidence ids namespaced under the question id", async () => {
    askJSON.mockResolvedValue([
      { stance: "supports", reliability: "high", sourceType: "primary", stanceConfidence: 0.9 },
      { stance: "supports", reliability: "high", sourceType: "primary", stanceConfidence: 0.9 },
    ]);
    const out = await classifyEvidence(claim, question, [raw(), raw()], ask);
    expect(out.map((e) => e.id)).toEqual(["c1-q1-e1", "c1-q1-e2"]);
  });

  it("carries provenance fields through from the raw source unchanged", async () => {
    askJSON.mockResolvedValue([
      { stance: "supports", reliability: "high", sourceType: "primary", stanceConfidence: 0.9 },
    ]);
    const [e] = await classifyEvidence(
      claim,
      question,
      [raw({ title: "Headline", url: "https://x.com/a", publishedDate: "2026-01-01" })],
      ask,
    );
    expect(e).toMatchObject({
      questionId: "c1-q1",
      title: "Headline",
      url: "https://x.com/a",
      publishedDate: "2026-01-01",
      passage: "a passage",
    });
  });

  it("forces wikipedia.org to high reliability, overriding the model's rating", async () => {
    // Wikipedia is a privileged trusted source: its reliability is not left to the LLM.
    askJSON.mockResolvedValue([
      { stance: "supports", reliability: "low", sourceType: "secondary", stanceConfidence: 0.8 },
    ]);
    const [e] = await classifyEvidence(
      claim,
      question,
      [raw({ domain: "en.wikipedia.org", url: "https://en.wikipedia.org/wiki/X" })],
      ask,
    );
    expect(e.reliability).toBe("high");
    // Only reliability is overridden — the model's stance/sourceType are kept.
    expect(e.stance).toBe("supports");
    expect(e.sourceType).toBe("secondary");
  });

  it("overrides the model DOWNWARD for a consensus low-credibility domain", async () => {
    // The static list is authoritative both ways: a known low-credibility outlet can't be
    // promoted to high by an over-generous model rating, so it can't move a verdict.
    askJSON.mockResolvedValue([
      { stance: "supports", reliability: "high", sourceType: "primary", stanceConfidence: 0.9 },
    ]);
    const [e] = await classifyEvidence(
      claim,
      question,
      [raw({ domain: "infowars.com", url: "https://infowars.com/x" })],
      ask,
    );
    expect(e.reliability).toBe("low");
    expect(e.stance).toBe("supports"); // stance untouched
  });

  it("falls back to a low-confidence contextual classification when one is missing", async () => {
    // Model returned fewer classifications than sources — the extra source must still map.
    askJSON.mockResolvedValue([
      { stance: "supports", reliability: "high", sourceType: "primary", stanceConfidence: 0.9 },
    ]);
    // Unknown domains so the static credibility list doesn't override the fallback's "low".
    const out = await classifyEvidence(
      claim,
      question,
      [raw({ domain: "unknown-a.example" }), raw({ domain: "unknown-b.example" })],
      ask,
    );
    expect(out[1]).toMatchObject({
      stance: "contextualizes",
      reliability: "low",
      sourceType: "secondary",
      stanceConfidence: 0.3,
    });
  });

  it("threads each source's published date and the claim's event date into the prompt", async () => {
    // The classifier can only reason that a source predating the event can't refute it if it
    // actually SEES both dates. Regression guard for the "alive on the 18th refutes death on
    // the 22nd" bug: the source date and the claim's event date must reach the model.
    askJSON.mockResolvedValue([
      {
        stance: "contextualizes",
        reliability: "high",
        sourceType: "primary",
        stanceConfidence: 0.4,
      },
    ]);
    const datedClaim: ClaimItem = { ...claim, date: "2026-02-22" };
    await classifyEvidence(
      datedClaim,
      question,
      [raw({ publishedDate: "2026-02-18", title: "El Mencho seen alive" })],
      ask,
    );
    const prompt = askJSON.mock.calls[0][0] as string;
    expect(prompt).toContain("2026-02-18"); // source publication date
    expect(prompt).toContain("2026-02-22"); // claim event date
  });
});
