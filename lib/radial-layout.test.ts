import { describe, it, expect } from "vitest";
import { radialLayout, buildRadialEdges, CIRCLE_DIAMETER } from "./radial-layout";
import type { FactGraph, EvidenceItem } from "./graph-types";

function ev(id: string, questionId: string, stance: EvidenceItem["stance"] = "supports"): EvidenceItem {
  return {
    id,
    questionId,
    title: "t",
    url: "https://bbc.com/x",
    domain: "bbc.com",
    passage: "p",
    stance,
    reliability: "high",
    sourceType: "primary",
    stanceConfidence: 0.9,
  };
}

// c1 pulls 3 evidence, c2 pulls 1 — so c1 should own a wider wedge (leaf-weighted allocation).
function graph(): FactGraph {
  return {
    source: { id: "src", text: "post", verdict: "conflicting" },
    claims: [
      { id: "c1", text: "c1", checkable: true, verdict: "supported" },
      { id: "c2", text: "c2", checkable: true, verdict: "refuted" },
    ],
    questions: [
      { id: "c1-q1", claimId: "c1", text: "q?", status: "answered" },
      { id: "c2-q1", claimId: "c2", text: "q?", status: "answered" },
    ],
    evidence: [
      ev("c1-q1-e1", "c1-q1"),
      ev("c1-q1-e2", "c1-q1"),
      ev("c1-q1-e3", "c1-q1"),
      ev("c2-q1-e1", "c2-q1", "refutes"),
    ],
  };
}

describe("radialLayout", () => {
  it("places one position per node", () => {
    // 1 source + 2 claims + 2 questions + 4 evidence
    expect(radialLayout(graph()).size).toBe(9);
  });

  it("puts the Source at the centre", () => {
    const p = radialLayout(graph()).get("src")!;
    expect(p.x).toBe(0);
    expect(p.y).toBe(0);
    expect(p.depth).toBe(0);
  });

  it("orders rings by depth: source < claim < question < evidence", () => {
    const pos = radialLayout(graph());
    const r = (id: string) => pos.get(id)!.radius;
    expect(r("src")).toBeLessThan(r("c1"));
    expect(r("c1")).toBeLessThan(r("c1-q1"));
    expect(r("c1-q1")).toBeLessThan(r("c1-q1-e1"));
  });

  it("sizes circles by depth only", () => {
    const pos = radialLayout(graph());
    expect(pos.get("src")!.diameter).toBe(CIRCLE_DIAMETER[0]);
    expect(pos.get("c1")!.diameter).toBe(CIRCLE_DIAMETER[1]);
    expect(pos.get("c1-q1")!.diameter).toBe(CIRCLE_DIAMETER[2]);
    expect(pos.get("c1-q1-e1")!.diameter).toBe(CIRCLE_DIAMETER[3]);
  });

  it("allocates a wider angular wedge to the claim with more evidence (leaf-weighted)", () => {
    const pos = radialLayout(graph());
    const c1 = ["c1-q1-e1", "c1-q1-e2", "c1-q1-e3"].map((id) => pos.get(id)!.angle);
    const c2 = [pos.get("c2-q1-e1")!.angle];
    const span = (a: number[]) => Math.max(...a) - Math.min(...a);
    expect(span(c1)).toBeGreaterThan(span(c2));
  });

  it("is deterministic", () => {
    const a = radialLayout(graph());
    const b = radialLayout(graph());
    for (const [id, p] of a) expect(b.get(id)).toEqual(p);
  });
});

describe("buildRadialEdges", () => {
  it("wires structural spokes plus a stance-labelled spoke per evidence", () => {
    const edges = buildRadialEdges(graph());
    // 2 source→claim + 2 claim→question + 4 question→evidence = 8 (no conflict chord: no single
    // claim has both deciding support and refutation here).
    expect(edges).toHaveLength(8);
    const stance = edges.find((e) => e.target === "c2-q1-e1")!;
    expect(stance.label).toBe("refutes");
  });
});
