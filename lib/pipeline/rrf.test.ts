import { describe, it, expect } from "vitest";
import { reciprocalRankFusion, RRF_K } from "./rrf";

const id = (x: { url: string }) => x.url;

describe("reciprocalRankFusion", () => {
  it("ranks a document well when it appears across multiple lists", () => {
    // b is mid-rank in both lists; a and c top one list each. Appearing in BOTH lifts b.
    const a = { url: "a" };
    const b = { url: "b" };
    const c = { url: "c" };
    const fused = reciprocalRankFusion(
      [
        [a, b],
        [c, b],
      ],
      id,
    );
    // b: 1/(k+1) + 1/(k+1); a: 1/(k+0); c: 1/(k+0). With k=60, b≈0.0328 > a≈c≈0.0164.
    expect(fused[0]).toBe(b);
  });

  it("preserves a single list's order", () => {
    const a = { url: "a" };
    const b = { url: "b" };
    const c = { url: "c" };
    expect(reciprocalRankFusion([[a, b, c]], id)).toEqual([a, b, c]);
  });

  it("dedupes by key across lists (one entry per document)", () => {
    const a1 = { url: "a" };
    const a2 = { url: "a" };
    const fused = reciprocalRankFusion([[a1], [a2]], id);
    expect(fused).toHaveLength(1);
    expect(fused[0]).toBe(a1); // first-seen instance is kept
  });

  it("breaks score ties by first-seen order (deterministic)", () => {
    // Each appears once at rank 0 → equal score; order is the order first seen.
    const a = { url: "a" };
    const b = { url: "b" };
    expect(reciprocalRankFusion([[a], [b]], id)).toEqual([a, b]);
  });

  it("returns an empty list for no input", () => {
    expect(reciprocalRankFusion([], id)).toEqual([]);
    expect(reciprocalRankFusion([[], []], id)).toEqual([]);
  });

  it("lets a higher rank in one list win when presence is otherwise equal", () => {
    // d appears once at rank 0; e appears once at rank 3. d outranks e.
    const d = { url: "d" };
    const e = { url: "e" };
    const fused = reciprocalRankFusion([[d], [{ url: "x" }, { url: "y" }, { url: "z" }, e]], id);
    expect(fused.indexOf(d)).toBeLessThan(fused.indexOf(e));
  });

  it("exposes the standard RRF k constant", () => {
    expect(RRF_K).toBe(60);
  });
});
