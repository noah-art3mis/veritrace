import { describe, it, expect } from "vitest";
import {
  hashId,
  jitter,
  parentOf,
  buildCardAnchors,
  buildRadialAnchors,
  seedPosition,
} from "./force-layout";
import type { AppNode, NodePosition } from "./graph-to-flow";
import type { RadialPosition } from "./radial-layout";

// The force layout's MATH is pure and deterministic (the codebase forbids Math.random/Date.now in
// layout). These tests pin the determinism, the ±amp bounds, the parent wiring, and — critically —
// that the card anchors keep the SOURCE→CLAIM→QUESTION→EVIDENCE reading order (#25). The animation
// itself (rAF, springs) is verified manually; here we only fix the inputs the sim is seeded from.

const SOURCE_ID = "src";

function node(id: string, type: AppNode["type"], item: Record<string, unknown> = {}): AppNode {
  return { id, type, position: { x: 0, y: 0 }, data: { item: { id, ...item } } } as AppNode;
}

describe("hashId", () => {
  it("is deterministic for the same input", () => {
    expect(hashId("c1-q2-e3")).toBe(hashId("c1-q2-e3"));
  });

  it("distinguishes different ids", () => {
    expect(hashId("a")).not.toBe(hashId("b"));
  });

  it("returns a non-negative 32-bit integer", () => {
    const h = hashId("anything");
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });
});

describe("jitter", () => {
  it("stays within ±amp", () => {
    for (const id of ["a", "b", "c1-q1-e1", "long-id-xyz"]) {
      expect(Math.abs(jitter(id, "x", 12))).toBeLessThanOrEqual(12);
      expect(Math.abs(jitter(id, "y", 12))).toBeLessThanOrEqual(12);
    }
  });

  it("is deterministic", () => {
    expect(jitter("n1", "x", 10)).toBe(jitter("n1", "x", 10));
  });

  it("decorrelates the x and y salts for the same id", () => {
    expect(jitter("n1", "x", 10)).not.toBe(jitter("n1", "y", 10));
  });

  it("scales with amp", () => {
    expect(jitter("n1", "x", 20)).toBeCloseTo(2 * jitter("n1", "x", 10), 6);
  });
});

describe("parentOf", () => {
  it("maps each node type to its parent id (source has none)", () => {
    expect(parentOf(node("src", "source"), SOURCE_ID)).toBeNull();
    expect(parentOf(node("c1", "claim"), SOURCE_ID)).toBe(SOURCE_ID);
    expect(parentOf(node("c1-q1", "question", { claimId: "c1" }), SOURCE_ID)).toBe("c1");
    expect(parentOf(node("c1-q1-e1", "evidence", { questionId: "c1-q1" }), SOURCE_ID)).toBe(
      "c1-q1",
    );
  });
});

describe("buildCardAnchors", () => {
  const nodes = [
    node("src", "source"),
    node("c1", "claim"),
    node("c1-q1", "question", { claimId: "c1" }),
    node("c1-q1-e1", "evidence", { questionId: "c1-q1" }),
  ];
  // Top-left positions with strictly increasing x per depth (dagre LR), spaced far apart.
  const positions = new Map<string, NodePosition>([
    ["src", { x: 0, y: 100, width: 380 }],
    ["c1", { x: 600, y: 100, width: 320 }],
    ["c1-q1", { x: 1100, y: 100, width: 280 }],
    ["c1-q1-e1", { x: 1600, y: 100, width: 320 }],
  ]);

  it("keeps the SOURCE→CLAIM→QUESTION→EVIDENCE reading order on the x anchor (#25)", () => {
    const a = buildCardAnchors(nodes, positions, SOURCE_ID);
    const x = (id: string) => a.find((m) => m.id === id)!.anchorX;
    expect(x("src")).toBeLessThan(x("c1"));
    expect(x("c1")).toBeLessThan(x("c1-q1"));
    expect(x("c1-q1")).toBeLessThan(x("c1-q1-e1"));
  });

  it("anchors x to the node's own column centre (no horizontal jitter)", () => {
    const a = buildCardAnchors(nodes, positions, SOURCE_ID);
    const claim = a.find((m) => m.id === "c1")!;
    expect(claim.anchorX).toBe(600 + 320 / 2); // top-left x + w/2
  });

  it("jitters the y anchor within ±12 of the node centre", () => {
    const a = buildCardAnchors(nodes, positions, SOURCE_ID);
    const claim = a.find((m) => m.id === "c1")!;
    expect(Math.abs(claim.anchorY - (100 + 160 / 2))).toBeLessThanOrEqual(12);
  });

  it("derives radius from SIZES (max(w,h)/2)", () => {
    const a = buildCardAnchors(nodes, positions, SOURCE_ID);
    expect(a.find((m) => m.id === "src")!.radius).toBe(380 / 2); // source 380x150
    expect(a.find((m) => m.id === "c1-q1")!.radius).toBe(280 / 2); // question 280x80
  });

  it("wires parentId for every node", () => {
    const a = buildCardAnchors(nodes, positions, SOURCE_ID);
    expect(a.find((m) => m.id === "src")!.parentId).toBeNull();
    expect(a.find((m) => m.id === "c1")!.parentId).toBe(SOURCE_ID);
    expect(a.find((m) => m.id === "c1-q1-e1")!.parentId).toBe("c1-q1");
  });
});

describe("buildRadialAnchors", () => {
  const nodes = [node("src", "source"), node("c1", "claim")];
  const positions = new Map<string, RadialPosition>([
    ["src", { x: 0, y: 0, angle: 0, radius: 0, depth: 0, diameter: 64 }],
    ["c1", { x: 120, y: -40, angle: 0.3, radius: 126, depth: 1, diameter: 44 }],
  ]);

  it("anchors near the radial centre within ±8 jitter and sets radius from diameter", () => {
    const a = buildRadialAnchors(nodes, positions, SOURCE_ID);
    const c1 = a.find((m) => m.id === "c1")!;
    expect(Math.abs(c1.anchorX - 120)).toBeLessThanOrEqual(8);
    expect(Math.abs(c1.anchorY - -40)).toBeLessThanOrEqual(8);
    expect(c1.radius).toBe(44 / 2);
  });
});

describe("seedPosition", () => {
  const meta = {
    id: "c1-q1-e1",
    type: "evidence" as const,
    w: 320,
    h: 210,
    radius: 160,
    anchorX: 1760,
    anchorY: 180,
    parentId: "c1-q1",
  };

  it("spawns a node within ±24 of its parent's live centre (springs outward, not from 0,0)", () => {
    const parent = { x: 1240, y: 90 };
    const seed = seedPosition(meta, parent);
    expect(Math.abs(seed.x - parent.x)).toBeLessThanOrEqual(24);
    expect(Math.abs(seed.y - parent.y)).toBeLessThanOrEqual(24);
  });

  it("falls back to its own anchor when there is no parent position", () => {
    expect(seedPosition(meta, null)).toEqual({ x: meta.anchorX, y: meta.anchorY });
  });
});
