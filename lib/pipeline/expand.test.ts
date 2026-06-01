import { describe, it, expect, vi } from "vitest";
import { expandQuery } from "./expand";
import type { AnthropicCaller } from "../anthropic";
import type { ClaimItem, QuestionItem } from "../graph-types";

const claim: ClaimItem = {
  id: "c1",
  text: "El Mencho died on 22 February 2026.",
  checkable: true,
  verdict: null,
};
const question: QuestionItem = {
  id: "c1-q1",
  claimId: "c1",
  text: "Did El Mencho die?",
  status: "searching",
};

function caller(askText: ReturnType<typeof vi.fn>): AnthropicCaller {
  return { askText, askJSON: vi.fn(), askWithTools: vi.fn() };
}

describe("expandQuery (HyDE)", () => {
  it("appends the hypothetical passage to the original question text", async () => {
    const askText = vi
      .fn()
      .mockResolvedValue("Wire services reported the death of the cartel leader.");
    const { seed } = await expandQuery(claim, question, caller(askText));
    expect(seed).toContain("Did El Mencho die?");
    expect(seed).toContain("Wire services reported");
  });

  it("returns the bare hypothetical separately (for the surfaced trace)", async () => {
    const askText = vi.fn().mockResolvedValue("  Wire services reported the death.  ");
    const { hypothetical } = await expandQuery(claim, question, caller(askText));
    expect(hypothetical).toBe("Wire services reported the death.");
  });

  it("falls back to the bare question, with an empty hypothetical, when the model returns nothing", async () => {
    const askText = vi.fn().mockResolvedValue("   ");
    const { seed, hypothetical } = await expandQuery(claim, question, caller(askText));
    expect(seed).toBe("Did El Mencho die?");
    expect(hypothetical).toBe("");
  });

  it("instructs the model not to assert a verdict (no confirmation bias in retrieval)", async () => {
    const askText = vi.fn().mockResolvedValue("x");
    await expandQuery(claim, question, caller(askText));
    const system = (askText.mock.calls[0][1] as { system: string }).system;
    expect(system).toMatch(/do not decide whether the claim is true or false/i);
  });
});
