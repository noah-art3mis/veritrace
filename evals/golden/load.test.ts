// The golden-set loader is the gate between raw JSONL on disk and the (future) scoring
// harness: it parses GoldenClaim records and REJECTS malformed ones so a corrupt gold can't
// silently skew eval scores. These tests pin that rejection behaviour, then assert the
// committed smoke set actually loads and exercises more than one verdict.

import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { parseGolden, loadGolden, GOLDEN_VERDICTS } from "./load.mjs";

const ok = {
  id: "averitec-smoke-00000",
  claim: "The unemployment rate fell to 3% in 2022.",
  gold: { verdict: "refuted", keyEvidenceUrls: [] },
  source: {
    org: "snopes",
    url: "https://snopes.com/x",
    originalRating: "False",
    language: "en",
    benchmark: "averitec",
  },
  license: "CC-BY-NC-4.0",
  split: "smoke",
  tags: [],
};
const line = (rec: unknown) => JSON.stringify(rec);

describe("parseGolden", () => {
  it("parses well-formed JSONL into records, ignoring blank lines", () => {
    const recs = parseGolden(`${line(ok)}\n\n${line({ ...ok, id: "averitec-smoke-00001" })}\n`);
    expect(recs).toHaveLength(2);
    expect(recs[0].gold.verdict).toBe("refuted");
  });

  it("rejects a verdict outside the four-way enum", () => {
    expect(() =>
      parseGolden(line({ ...ok, gold: { verdict: "mostly-false", keyEvidenceUrls: [] } })),
    ).toThrow(/verdict/i);
  });

  it("rejects a duplicate id (would double-count in scoring)", () => {
    expect(() => parseGolden(`${line(ok)}\n${line(ok)}`)).toThrow(/duplicate/i);
  });

  it("rejects an empty claim and a missing source url", () => {
    expect(() => parseGolden(line({ ...ok, claim: "   " }))).toThrow(/claim/i);
    expect(() => parseGolden(line({ ...ok, source: { ...ok.source, url: undefined } }))).toThrow(
      /url/i,
    );
  });

  it("rejects a line that isn't valid JSON", () => {
    expect(() => parseGolden("{not json")).toThrow(/line 1/i);
  });
});

describe("the committed smoke set", () => {
  const path = fileURLToPath(new URL("./smoke.jsonl", import.meta.url));

  it("loads cleanly and exercises more than one verdict", () => {
    const recs = loadGolden(path);
    expect(recs.length).toBeGreaterThanOrEqual(8);
    expect(recs.every((r) => r.split === "smoke")).toBe(true);
    const verdicts = new Set(recs.map((r) => r.gold.verdict));
    expect(verdicts.size).toBeGreaterThan(1);
    expect([...verdicts].every((v) => GOLDEN_VERDICTS.includes(v))).toBe(true);
  });
});
