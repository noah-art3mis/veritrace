import { describe, it, expect, vi } from "vitest";
import { expandQuery } from "./expand";
import type { AnthropicCaller } from "../anthropic";
import type { ClaimItem, QuestionItem } from "../graph-types";

const claim: ClaimItem = { id: "c1", text: "El Mencho died on 22 February 2026.", checkable: true, verdict: null };
const question: QuestionItem = { id: "c1-q1", claimId: "c1", text: "Did El Mencho die?", status: "searching" };

function caller(askText: ReturnType<typeof vi.fn>): AnthropicCaller {
  return { askText, askJSON: vi.fn() };
}

describe("expandQuery (HyDE)", () => {
  it("appends the hypothetical passage to the original question text", async () => {
    const askText = vi.fn().mockResolvedValue("Wire services reported the death of the cartel leader.");
    const query = await expandQuery(claim, question, caller(askText));
    expect(query).toContain("Did El Mencho die?");
    expect(query).toContain("Wire services reported");
  });

  it("falls back to the bare question when the model returns nothing", async () => {
    const askText = vi.fn().mockResolvedValue("   ");
    const query = await expandQuery(claim, question, caller(askText));
    expect(query).toBe("Did El Mencho die?");
  });

  it("instructs the model not to assert a verdict (no confirmation bias in retrieval)", async () => {
    const askText = vi.fn().mockResolvedValue("x");
    await expandQuery(claim, question, caller(askText));
    const system = (askText.mock.calls[0][1] as { system: string }).system;
    expect(system).toMatch(/do not decide whether the claim is true or false/i);
  });
});
