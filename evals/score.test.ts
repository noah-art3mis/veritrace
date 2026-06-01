// The scoring core of the eval harness: turn (gold, predicted) verdict pairs into accuracy,
// per-class recall, and a confusion matrix. Pure + key-free, so it runs in CI even though the
// live runner that produces the pairs (run.eval.test.ts) is skipped without an API key.

import { describe, it, expect } from "vitest";
import { scoreReport, filterByTag, isDeNovoCheckable } from "./score.mjs";

// 6 graded items: 4 correct, 1 wrong, 1 unpredicted (null → bucketed as an error, not a hit).
const items = [
  { id: "a", gold: "supported", predicted: "supported", tags: ["de-novo-checkable"] },
  { id: "b", gold: "refuted", predicted: "refuted", tags: ["de-novo-checkable"] },
  { id: "c", gold: "refuted", predicted: "supported", tags: ["de-novo-checkable"] }, // miss
  { id: "d", gold: "nei", predicted: "nei", tags: ["provenance"] },
  { id: "e", gold: "conflicting", predicted: "conflicting", tags: ["provenance"] },
  { id: "f", gold: "supported", predicted: null, tags: ["de-novo-checkable"] }, // pipeline gave nothing
];

describe("scoreReport", () => {
  const r = scoreReport(items);

  it("computes overall accuracy, counting a null prediction as a miss", () => {
    expect(r.n).toBe(6);
    expect(r.correct).toBe(4);
    expect(r.accuracy).toBeCloseTo(4 / 6, 10);
  });

  it("reports per-gold-class recall", () => {
    // supported: golds a & f, only a predicted right → 1/2
    expect(r.byGold.supported).toMatchObject({ n: 2, correct: 1 });
    expect(r.byGold.supported.recall).toBeCloseTo(0.5, 10);
    // refuted: golds b & c, only b right → 1/2
    expect(r.byGold.refuted.recall).toBeCloseTo(0.5, 10);
    // a gold class with no examples has null recall, not NaN
    expect(scoreReport([]).byGold.nei.recall).toBeNull();
  });

  it("reports per-class precision, recall, and F1", () => {
    // supported is predicted twice (a correct, c wrong) → P 1/2; recalled 1 of 2 golds → R 1/2.
    expect(r.byGold.supported.precision).toBeCloseTo(0.5, 10);
    expect(r.byGold.supported.recall).toBeCloseTo(0.5, 10);
    expect(r.byGold.supported.f1).toBeCloseTo(0.5, 10);
    // refuted predicted once and correct → P 1.0; recalled 1 of 2 → R 0.5; F1 harmonic.
    expect(r.byGold.refuted.precision).toBeCloseTo(1.0, 10);
    expect(r.byGold.refuted.f1).toBeCloseTo(2 / 3, 10);
  });

  it("computes macro-averaged precision/recall/F1 across the four classes", () => {
    expect(r.macro.precision).toBeCloseTo(0.875, 10);
    expect(r.macro.recall).toBeCloseTo(0.75, 10);
    expect(r.macro.f1).toBeCloseTo(0.7916667, 6);
  });

  it("returns null precision for a class the model never predicts (no divide-by-zero)", () => {
    // Only 'supported' golds, all predicted nei → conflicting/refuted/supported never predicted.
    const r2 = scoreReport([{ gold: "supported", predicted: "nei" }]);
    expect(r2.byGold.conflicting.precision).toBeNull();
    expect(r2.byGold.supported.recall).toBeCloseTo(0, 10);
  });

  it("builds a gold→predicted confusion matrix, bucketing nulls under 'error'", () => {
    expect(r.confusion.refuted).toEqual({ refuted: 1, supported: 1 });
    expect(r.confusion.supported).toEqual({ supported: 1, error: 1 });
  });

  it("guards an empty input (no division by zero)", () => {
    expect(scoreReport([]).accuracy).toBeNull();
  });
});

describe("filterByTag", () => {
  it("slices items to a tag so subsets can be scored apart", () => {
    const denovo = filterByTag(items, "de-novo-checkable");
    expect(denovo).toHaveLength(4);
    // de-novo slice: a,b correct; c,f wrong → 0.5
    expect(scoreReport(denovo).accuracy).toBeCloseTo(0.5, 10);
  });
});

describe("isDeNovoCheckable", () => {
  it("flags provenance claim-types (quote/image) that the pipeline can't check de novo", () => {
    // VERITRACE scores ~0 on these by category mismatch — they must be reported apart, not
    // silently dragging the headline accuracy.
    expect(isDeNovoCheckable({ tags: ["quote-verification"] })).toBe(false);
    expect(isDeNovoCheckable({ tags: ["image"] })).toBe(false);
    expect(isDeNovoCheckable({ tags: ["numerical-claim", "causal-claim"] })).toBe(true);
    expect(isDeNovoCheckable({ tags: [] })).toBe(true);
    expect(isDeNovoCheckable({})).toBe(true);
  });
});
