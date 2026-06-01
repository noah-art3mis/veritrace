import { describe, it, expect } from "vitest";
import { graphDigest, summaryPrompt } from "./summarize";
import { MOCK_GRAPH } from "../mock-graph";
import type { FactGraph } from "../graph-types";

describe("graphDigest", () => {
  it("counts checked claims by verdict (dropped claims excluded)", () => {
    const d = graphDigest(MOCK_GRAPH);
    expect(d.total).toBe(3);
    expect(d.byVerdict).toMatchObject({ supported: 1, refuted: 1, conflicting: 0, nei: 1 });
    expect(d.dropped).toBe(0);
  });

  it("does not count a relevance-dropped claim toward the checked total", () => {
    const g: FactGraph = {
      ...MOCK_GRAPH,
      claims: [
        ...MOCK_GRAPH.claims,
        {
          id: "c9",
          text: "Springfield is a city.",
          verdict: null,
          checkable: true,
          relevant: false,
        },
      ],
    };
    const d = graphDigest(g);
    expect(d.total).toBe(3); // unchanged — dropped claim is not "checked"
    expect(d.dropped).toBe(1);
  });

  it("breaks evidence down by stance, reliability, and type", () => {
    const d = graphDigest(MOCK_GRAPH);
    expect(d.evidence.total).toBe(3);
    expect(d.evidence.byStance).toMatchObject({ supports: 1, refutes: 2, contextualizes: 0 });
    expect(d.evidence.byReliability).toMatchObject({ high: 2, medium: 1, low: 0 });
    expect(d.evidence.byType).toMatchObject({ primary: 3, secondary: 0, opinion: 0 });
  });

  it("lists distinct evidence domains", () => {
    const d = graphDigest(MOCK_GRAPH);
    expect(new Set(d.evidence.domains)).toEqual(new Set(["cnnespanol.cnn.com", "infobae.com"]));
  });
});

describe("summaryPrompt", () => {
  it("embeds each checked claim's text and resolved verdict so the model can summarize them", () => {
    const p = summaryPrompt(MOCK_GRAPH);
    for (const c of MOCK_GRAPH.claims) {
      expect(p).toContain(c.text);
    }
    // Verdict words must reach the prompt (case-insensitive) — they are the spine of the summary.
    expect(p.toLowerCase()).toContain("supported");
    expect(p.toLowerCase()).toContain("refuted");
  });

  it("includes the overall support ratio and the evidence count", () => {
    const p = summaryPrompt(MOCK_GRAPH);
    expect(p).toContain("1 of 3"); // 1 supported of 3 checked claims
    expect(p).toMatch(/3 (sources|evidence)/i);
  });
});
