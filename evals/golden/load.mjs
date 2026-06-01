// Load + validate GoldenClaim JSONL (see ./schema.ts). The gate between raw files on disk
// and the scoring harness: parse every record and throw on the first malformed one, so a
// corrupt gold (bad verdict label, empty claim, duplicate id) can't silently skew the eval
// numbers. Dependency-free ESM, mirroring ./convert.mjs; the pure `parseGolden` is unit-tested
// in ./load.test.ts.

import { readFileSync } from "node:fs";

/** Runtime mirror of the `Verdict` type in lib/graph-types.ts (a compile-time-only union).
 *  Kept in lockstep with AVERITEC_LABELS' targets in ./convert.mjs. */
export const GOLDEN_VERDICTS = ["supported", "refuted", "conflicting", "nei"];

/**
 * Parse GoldenClaim JSONL text into validated records. Blank lines are skipped. Throws with
 * a line-numbered message on the first record that isn't usable — invalid JSON, missing or
 * duplicate id, empty claim, a verdict outside the four-way enum, or a missing source url.
 */
export function parseGolden(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((l, i) => [l.trim(), i + 1])
    .filter(([l]) => l.length);
  const seen = new Set();
  return lines.map(([line, lineNo]) => {
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      throw new Error(`line ${lineNo}: invalid JSON`);
    }
    const where = `line ${lineNo} (id=${rec.id ?? "?"})`;
    if (typeof rec.id !== "string" || !rec.id) throw new Error(`${where}: missing/blank id`);
    if (seen.has(rec.id)) throw new Error(`${where}: duplicate id`);
    seen.add(rec.id);
    if (typeof rec.claim !== "string" || !rec.claim.trim())
      throw new Error(`${where}: empty claim`);
    if (!GOLDEN_VERDICTS.includes(rec.gold?.verdict))
      throw new Error(`${where}: verdict ${JSON.stringify(rec.gold?.verdict)} not in enum`);
    if (typeof rec.source?.url !== "string") throw new Error(`${where}: missing source.url`);
    return rec;
  });
}

/** Read + validate a GoldenClaim JSONL file from disk. */
export function loadGolden(path) {
  return parseGolden(readFileSync(path, "utf8"));
}
