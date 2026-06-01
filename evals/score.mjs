// Scoring core for the VERITRACE eval harness. Pure + dependency-free: turns a list of
// (gold, predicted) verdict pairs into accuracy, per-gold-class recall, and a confusion
// matrix. No keys, no network — the live runner (./run.eval.test.ts) produces the pairs by
// running the pipeline; this module just grades them, so it stays unit-testable in CI.

import { GOLDEN_VERDICTS } from "./golden/load.mjs";

/**
 * @typedef {Object} GradedItem
 * @property {string} [id]
 * @property {string} gold        - the gold verdict (one of GOLDEN_VERDICTS)
 * @property {string|null} predicted - the pipeline's verdict, or null if it produced none
 * @property {string[]} [tags]
 */

/** A prediction the pipeline declined to make (null) is bucketed here in the confusion
 *  matrix — kept distinct from "nei" so "the pipeline gave up" never looks like a real call. */
const NO_PREDICTION = "error";

/**
 * Grade graded items into a report. A null/absent prediction counts as a miss (never a hit).
 * @param {GradedItem[]} items
 * @returns {{ n: number, correct: number, accuracy: number|null,
 *   byGold: Record<string, { n: number, correct: number, recall: number|null }>,
 *   confusion: Record<string, Record<string, number>> }}
 */
export function scoreReport(items) {
  const n = items.length;
  let correct = 0;
  const confusion = {};

  for (const { gold, predicted } of items) {
    if (predicted === gold) correct += 1;
    const p = predicted ?? NO_PREDICTION;
    (confusion[gold] ??= {})[p] = (confusion[gold][p] || 0) + 1;
  }

  const byGold = {};
  for (const v of GOLDEN_VERDICTS) {
    const golds = items.filter((i) => i.gold === v);
    const hits = golds.filter((i) => i.predicted === v).length;
    byGold[v] = {
      n: golds.length,
      correct: hits,
      recall: golds.length ? hits / golds.length : null,
    };
  }

  return { n, correct, accuracy: n ? correct / n : null, byGold, confusion };
}

/** Items carrying `tag` — for reporting subsets apart. */
export function filterByTag(items, tag) {
  return items.filter((i) => Array.isArray(i.tags) && i.tags.includes(tag));
}

/** AVeriTeC claim-type slugs VERITRACE cannot check de novo: it grades assertions against
 *  retrieved evidence, so image/quote *provenance* items ("did X say Y", "is this photo real")
 *  score ~0 by category mismatch — not a pipeline failure. Reported as a separate slice so
 *  they don't drag the headline (see evals/golden/README.md, "things to get right"). */
export const PROVENANCE_TAGS = ["quote-verification", "image", "video", "audio"];

/** True when none of the item's tags mark it provenance — i.e. a fair de-novo target. */
export function isDeNovoCheckable(item) {
  const tags = Array.isArray(item?.tags) ? item.tags : [];
  return !tags.some((t) => PROVENANCE_TAGS.includes(t));
}

/** Render a report as a compact Markdown block for console / logs. */
export function formatReport(report, title = "eval") {
  const pct = (x) => (x == null ? "—" : `${(x * 100).toFixed(1)}%`);
  const lines = [
    `### ${title}`,
    ``,
    `**accuracy ${pct(report.accuracy)}**  (${report.correct}/${report.n})`,
    ``,
    `| gold class  |  n | correct | recall |`,
    `| ----------- | -: | ------: | -----: |`,
  ];
  for (const v of GOLDEN_VERDICTS) {
    const g = report.byGold[v];
    lines.push(
      `| ${v.padEnd(11)} | ${String(g.n).padStart(2)} | ${String(g.correct).padStart(7)} | ${pct(g.recall).padStart(6)} |`,
    );
  }
  return lines.join("\n");
}
