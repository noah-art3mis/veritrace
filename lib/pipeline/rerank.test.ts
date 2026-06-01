import { describe, it, expect, vi } from "vitest";
import { cosineSimilarity, averageVectors, createReranker } from "./rerank";
import type { RawEvidence } from "../exa";

function raw(url: string, text: string): RawEvidence {
  return { title: url, url, domain: url, passage: text, text };
}

describe("cosineSimilarity", () => {
  it("is 1 for identical direction and 0 for orthogonal", () => {
    expect(cosineSimilarity([1, 0], [2, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });
  it("is 0 when either vector is degenerate", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("averageVectors", () => {
  it("takes the element-wise mean", () => {
    expect(
      averageVectors([
        [0, 2],
        [2, 0],
      ]),
    ).toEqual([1, 1]);
  });
  it("returns [] for no vectors", () => {
    expect(averageVectors([])).toEqual([]);
  });
});

describe("createReranker", () => {
  it("is OFF (null) with no key and no injected embed — the default", () => {
    expect(createReranker({})).toBeNull();
  });

  it("ranks candidates by cosine to the averaged hypothetical embedding, keeping top-N", async () => {
    // Anchors average to [1,0]. doc 'a' aligns with it, 'b' is orthogonal → 'a' wins, 'c' dropped.
    const embed = vi.fn(async (texts: string[]) => {
      const map: Record<string, number[]> = {
        anchorText: [1, 0],
        "doc a": [1, 0], // aligned with the anchor
        "doc b": [0, 1], // orthogonal
        "doc c": [0, 1], // orthogonal
      };
      return texts.map((t) => map[t] ?? [0, 0]);
    });
    const reranker = createReranker({ embed })!;
    const docs = [raw("b", "doc b"), raw("a", "doc a"), raw("c", "doc c")];
    const out = await reranker.rerank(["anchorText"], docs, 2);
    expect(out).toHaveLength(2);
    expect(out[0].url).toBe("a"); // most similar to the hypothetical
  });

  it("returns the input unchanged when at or under the limit", async () => {
    const embed = vi.fn();
    const reranker = createReranker({ embed: embed as never })!;
    const docs = [raw("a", "x"), raw("b", "y")];
    expect(await reranker.rerank(["q"], docs, 3)).toEqual(docs);
    expect(embed).not.toHaveBeenCalled(); // no embedding spend when there's nothing to cut
  });

  it("falls back to the input order if embedding throws (booster, not a gate)", async () => {
    const embed = vi.fn().mockRejectedValue(new Error("Cohere 500"));
    const reranker = createReranker({ embed })!;
    const docs = [raw("a", "x"), raw("b", "y"), raw("c", "z")];
    expect(await reranker.rerank(["q"], docs, 2)).toEqual(docs);
  });
});
