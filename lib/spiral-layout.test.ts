import { describe, it, expect } from "vitest";
import { spiralLayout } from "./spiral-layout";
import type { FactGraph, EvidenceItem } from "./graph-types";

// A small graph: one source, one claim, one question, three evidence with explicit walk hops out
// of order (2, 0, 1) so we can assert the spiral re-orders them by depth.
function ev(id: string, depth: number | undefined): EvidenceItem {
  return {
    id,
    questionId: "q1",
    title: id,
    url: `https://example.com/${id}`,
    domain: "example.com",
    passage: "",
    stance: "supports",
    reliability: "medium",
    sourceType: "secondary",
    ...(depth === undefined ? {} : { depth }),
  };
}

const graph: FactGraph = {
  source: { id: "src", text: "t", verdict: null },
  claims: [{ id: "c1", text: "claim", verdict: null, checkable: true }],
  questions: [{ id: "q1", claimId: "c1", text: "q", status: "answered" }],
  evidence: [ev("e-hop2", 2), ev("e-hop0", 0), ev("e-hop1", 1)],
};

describe("spiralLayout", () => {
  it("places the source at the centre", () => {
    const pos = spiralLayout(graph).get("src");
    expect(pos).toMatchObject({ x: 0, y: 0, radius: 0, depth: 0 });
  });

  it("positions every node", () => {
    const positions = spiralLayout(graph);
    for (const id of ["src", "c1", "q1", "e-hop0", "e-hop1", "e-hop2"]) {
      expect(positions.has(id)).toBe(true);
    }
  });

  it("winds outward along an arm — radius grows from core → claim → question → evidence by hop", () => {
    const p = spiralLayout(graph);
    const radii = ["src", "c1", "q1", "e-hop0", "e-hop1", "e-hop2"].map((id) => p.get(id)!.radius);
    for (let i = 1; i < radii.length; i++) {
      expect(radii[i]).toBeGreaterThan(radii[i - 1]);
    }
  });

  it("twists the arm — each evidence hop advances the angle (the pinwheel curl)", () => {
    const p = spiralLayout(graph);
    expect(p.get("e-hop1")!.angle).toBeGreaterThan(p.get("e-hop0")!.angle);
    expect(p.get("e-hop2")!.angle).toBeGreaterThan(p.get("e-hop1")!.angle);
  });

  it("orders a question's evidence by walk hop (depth 0 nearest the centre)", () => {
    const p = spiralLayout(graph);
    // The coil visits evidence in hop order, so hop0 sits at a smaller radius than hop1 than hop2,
    // regardless of the order they appear in graph.evidence.
    expect(p.get("e-hop0")!.radius).toBeLessThan(p.get("e-hop1")!.radius);
    expect(p.get("e-hop1")!.radius).toBeLessThan(p.get("e-hop2")!.radius);
  });

  it("encodes layer as circle diameter (source largest → evidence smallest)", () => {
    const p = spiralLayout(graph);
    expect(p.get("src")!.diameter).toBeGreaterThan(p.get("c1")!.diameter);
    expect(p.get("c1")!.diameter).toBeGreaterThan(p.get("q1")!.diameter);
    expect(p.get("q1")!.diameter).toBeGreaterThan(p.get("e-hop0")!.diameter);
  });

  it("is deterministic — same graph lays out identically", () => {
    expect([...spiralLayout(graph).entries()]).toEqual([...spiralLayout(graph).entries()]);
  });

  it("sorts undated (breadth) evidence after hopped evidence", () => {
    const mixed: FactGraph = {
      ...graph,
      evidence: [ev("e-none", undefined), ev("e-hop0", 0)],
    };
    const p = spiralLayout(mixed);
    // hop0 has a finite depth and sorts before the undefined-depth (breadth) item.
    expect(p.get("e-hop0")!.radius).toBeLessThan(p.get("e-none")!.radius);
  });

  // --- The galaxy: one arm per claim ----------------------------------------------------------

  it("gives each claim its own arm — claims share the inner ring at distinct angles", () => {
    const galaxy: FactGraph = {
      source: { id: "src", text: "t", verdict: null },
      claims: Array.from({ length: 5 }, (_, i) => ({
        id: `c${i}`,
        text: "claim",
        verdict: null,
        checkable: true,
      })),
      questions: [],
      evidence: [],
    };
    const p = spiralLayout(galaxy);
    const claims = ["c0", "c1", "c2", "c3", "c4"].map((id) => p.get(id)!);
    // All claims sit on one ring (same radius from the core)...
    const r = claims[0].radius;
    for (const c of claims) expect(c.radius).toBeCloseTo(r);
    // ...at evenly-spaced, distinct angles (5 arms ⇒ 2π/5 apart).
    const angles = claims.map((c) => c.angle);
    expect(new Set(angles).size).toBe(5);
    expect(angles[1] - angles[0]).toBeCloseTo((2 * Math.PI) / 5);
  });

  it("forks a multi-question claim — its question sub-arms fan to distinct angles", () => {
    const forked: FactGraph = {
      source: { id: "src", text: "t", verdict: null },
      claims: [{ id: "c1", text: "claim", verdict: null, checkable: true }],
      questions: [
        { id: "q1", claimId: "c1", text: "q1", status: "answered" },
        { id: "q2", claimId: "c1", text: "q2", status: "answered" },
      ],
      evidence: [],
    };
    const p = spiralLayout(forked);
    expect(p.get("q1")!.angle).not.toBeCloseTo(p.get("q2")!.angle);
    // Both questions sit at the same radius (the root of their evidence strands).
    expect(p.get("q1")!.radius).toBeCloseTo(p.get("q2")!.radius);
  });
});
