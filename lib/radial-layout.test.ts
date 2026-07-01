import { describe, it, expect } from "vitest";
import { radialLayout, buildRadialEdges, CIRCLE_DIAMETER } from "./radial-layout";
import type { FactGraph, EvidenceItem } from "./graph-types";
import { STANCE_META, VERDICT_META } from "./visuals";

function ev(
  id: string,
  questionId: string,
  stance: EvidenceItem["stance"] = "supports",
): EvidenceItem {
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

  it("clusters evidence just outside its question, not flung to the rim (#107)", () => {
    const pos = radialLayout(graph());
    const claimR = pos.get("c1")!.radius;
    const qR = pos.get("c1-q1")!.radius;
    const evR = pos.get("c1-q1-e1")!.radius;
    // Evidence sits a SHORT hop beyond its question — closer to the question than the question is to
    // its claim — so the parent→child spoke reads as proximity, not a long line to the outer ring.
    expect(evR - qR).toBeGreaterThan(0); // still on a strictly outer ring (depth read intact)
    expect(evR - qR).toBeLessThan(qR - claimR);
  });

  it("fans a question's evidence tightly around the question's own angle (#107)", () => {
    const pos = radialLayout(graph());
    const qAngle = pos.get("c1-q1")!.angle;
    const evAngles = ["c1-q1-e1", "c1-q1-e2", "c1-q1-e3"].map((id) => pos.get(id)!.angle);
    // The cluster is centred on the question (symmetric fan), so the question's angle is the mean of
    // its evidence angles rather than sitting off to one side.
    const mean = evAngles.reduce((s, a) => s + a, 0) / evAngles.length;
    expect(Math.abs(mean - qAngle)).toBeLessThan(1e-9);
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
    // The stance label now rides in `data` for the zoom-aware custom edge (#47), not the
    // always-on `label` prop.
    expect(stance.type).toBe("radialLabel");
    expect(stance.data).toMatchObject({ label: "refutes" });
  });

  // Same support-colour propagation as the card view (#24): before a verdict lands, the deciding
  // stance of the evidence beneath a claim flows up the structural spokes back to the claim.
  function unresolvedGraph(stance: EvidenceItem["stance"]): FactGraph {
    return {
      source: { id: "src", text: "post", verdict: null },
      claims: [{ id: "c1", text: "c1", checkable: true, verdict: null }],
      questions: [{ id: "c1-q1", claimId: "c1", text: "q?", status: "answered" }],
      evidence: [ev("c1-q1-e1", "c1-q1", stance)],
    };
  }

  it("propagates the deciding support stance up the structural spokes", () => {
    const edges = buildRadialEdges(unresolvedGraph("supports"));
    const srcToClaim = edges.find((e) => e.source === "src" && e.target === "c1")!;
    const claimToQ = edges.find((e) => e.source === "c1" && e.target === "c1-q1")!;
    expect(srcToClaim.style?.stroke).toBe(STANCE_META.supports.color);
    expect(claimToQ.style?.stroke).toBe(STANCE_META.supports.color);
  });

  it("colours the source→claim spoke conflicting when deciding sources disagree", () => {
    const g = unresolvedGraph("supports");
    g.questions.push({ id: "c1-q2", claimId: "c1", text: "q2?", status: "answered" });
    g.evidence.push(ev("c1-q2-e1", "c1-q2", "refutes"));
    const edges = buildRadialEdges(g);
    expect(edges.find((e) => e.source === "src" && e.target === "c1")!.style?.stroke).toBe(
      VERDICT_META.conflicting.color,
    );
  });

  it("keeps a spoke faint when no source can decide", () => {
    const g = unresolvedGraph("supports");
    g.evidence[0].reliability = "low";
    const edges = buildRadialEdges(g);
    expect(edges.find((e) => e.source === "src" && e.target === "c1")!.style?.stroke).not.toBe(
      STANCE_META.supports.color,
    );
  });
});
