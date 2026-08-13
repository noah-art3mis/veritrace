import { describe, it, expect, vi } from "vitest";
import { expandQuery } from "./expand";
import type { ReasoningProvider } from "../reasoner-types";
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

function caller(askText: ReturnType<typeof vi.fn>): ReasoningProvider {
  return { askText, askJSON: vi.fn(), askWithTools: vi.fn() };
}

describe("expandQuery (HyDE)", () => {
  it("seeds retrieval with the question plus BOTH directional anchors", async () => {
    const askText = vi
      .fn()
      .mockResolvedValue(
        "Wire services reported the death of the cartel leader on 22 February.\nMexican officials denied reports that the cartel leader had died.",
      );
    const { seed } = await expandQuery(claim, question, caller(askText));
    expect(seed).toContain("Did El Mencho die?");
    expect(seed).toContain("Wire services reported"); // confirm-shaped anchor
    expect(seed).toContain("officials denied"); // refute/denial-shaped anchor
  });

  it("labels the two directions in the surfaced trace, not in the seed", async () => {
    const askText = vi
      .fn()
      .mockResolvedValue("Wire services reported the death.\nOfficials denied the death.");
    const { hypothetical, seed } = await expandQuery(claim, question, caller(askText));
    expect(hypothetical).toContain("would confirm: Wire services reported the death.");
    expect(hypothetical).toContain("would refute: Officials denied the death.");
    // The labels steer the human-facing trace only; the retrieval seed stays label-free.
    expect(seed).not.toContain("would confirm");
  });

  it("strips a stray leading label the model may add to a line", async () => {
    const askText = vi
      .fn()
      .mockResolvedValue(
        "Confirm: Wire services reported the death.\nRefute: Officials denied it.",
      );
    const { hypothetical } = await expandQuery(claim, question, caller(askText));
    expect(hypothetical).toContain("would confirm: Wire services reported the death.");
    expect(hypothetical).toContain("would refute: Officials denied it.");
  });

  it("falls back to the bare question, with an empty hypothetical, when the model returns nothing", async () => {
    const askText = vi.fn().mockResolvedValue("   ");
    const { seed, hypothetical } = await expandQuery(claim, question, caller(askText));
    expect(seed).toBe("Did El Mencho die?");
    expect(hypothetical).toBe("");
  });

  it("frames both directions as a balanced net, not a verdict (anti-bias)", async () => {
    const askText = vi.fn().mockResolvedValue("a\nb");
    await expandQuery(claim, question, caller(askText));
    const system = (askText.mock.calls[0][1] as { system: string }).system;
    expect(system).toMatch(/confirm/i);
    expect(system).toMatch(/refute|denial/i);
    expect(system).toMatch(/not deciding the claim is true or false/i);
  });
});
