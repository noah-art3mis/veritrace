import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReasoningProvider } from "../reasoner-types";

const askJSON = vi.fn();
const ask: ReasoningProvider = { askJSON, askText: vi.fn(), askWithTools: vi.fn() };

import { generateQuestions } from "./questions";
import type { ClaimItem } from "../graph-types";

function claim(over: Partial<ClaimItem> = {}): ClaimItem {
  return { id: "c1", text: "a claim", checkable: true, verdict: null, ...over };
}

beforeEach(() => askJSON.mockReset());

describe("generateQuestions", () => {
  it("returns no questions for an unckeckable claim and skips the model call entirely", async () => {
    const out = await generateQuestions(claim({ checkable: false }), ask, 2);
    expect(out).toEqual([]);
    expect(askJSON).not.toHaveBeenCalled();
  });

  it("returns no questions for a non-checkworthy (opinion) claim and skips the model call", async () => {
    const out = await generateQuestions(claim({ checkworthy: false }), ask, 2);
    expect(out).toEqual([]);
    expect(askJSON).not.toHaveBeenCalled();
  });

  it("returns no questions for a relevance-dropped (trivial background) claim and skips the model call", async () => {
    const out = await generateQuestions(claim({ relevant: false }), ask, 2);
    expect(out).toEqual([]);
    expect(askJSON).not.toHaveBeenCalled();
  });

  it("namespaces question ids under the claim id", async () => {
    askJSON.mockResolvedValue(["q one?", "q two?"]);
    const out = await generateQuestions(claim({ id: "c2" }), ask, 2);
    expect(out.map((q) => q.id)).toEqual(["c2-q1", "c2-q2"]);
  });

  it("back-references the parent claim and starts each question pending", async () => {
    askJSON.mockResolvedValue(["q?"]);
    const [q] = await generateQuestions(claim({ id: "c7" }), ask, 2);
    expect(q.claimId).toBe("c7");
    expect(q.status).toBe("pending");
    expect(q.text).toBe("q?");
  });

  it("caps questions at the per-run maximum", async () => {
    askJSON.mockResolvedValue(["a?", "b?", "c?", "d?"]);
    expect(await generateQuestions(claim(), ask, 2)).toHaveLength(2);
  });

  it("honours a lower per-run maximum (e.g. one question per claim)", async () => {
    askJSON.mockResolvedValue(["a?", "b?", "c?"]);
    const out = await generateQuestions(claim(), ask, 1);
    expect(out).toHaveLength(1);
  });

  it("tells the model the per-run maximum in the prompt", async () => {
    askJSON.mockResolvedValue([]);
    await generateQuestions(claim(), ask, 1);
    expect(askJSON.mock.calls[0][1].system).toContain("At most 1");
  });

  it("includes the claim text in the prompt", async () => {
    askJSON.mockResolvedValue([]);
    await generateQuestions(claim({ text: "El Mencho died" }), ask, 2);
    expect(askJSON.mock.calls[0][0]).toContain("El Mencho died");
  });
});
