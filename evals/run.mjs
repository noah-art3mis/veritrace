// Harness core: run each golden claim through the pipeline and pair its document-level
// verdict with the gold label, yielding graded items for ./score.mjs. The pipeline runner is
// INJECTED (`runOne`), so this module is key-free and unit-testable offline; the live wiring
// (collectGraph bound to real Anthropic/Exa deps) is supplied by ./run.eval.test.ts.

/**
 * @param {Array<{id: string, claim: string, claimDate?: string, gold: {verdict: string}, tags?: string[]}>} golds
 * @param {(claimText: string, asOf?: string) => Promise<{source: {verdict: string|null}}>} runOne
 * @returns {Promise<Array<{id: string, claim: string, gold: string, predicted: string|null, tags: string[]}>>}
 */
export async function runEval(golds, runOne) {
  const items = [];
  for (const g of golds) {
    // Pass the gold's claimDate as the as-of date so the pipeline windows retrieval to the
    // claim's era instead of today — without it a 2020 claim retrieves 2024 debunks (leakage).
    const graph = await runOne(g.claim, g.claimDate);
    items.push({
      id: g.id,
      claim: g.claim,
      gold: g.gold.verdict,
      predicted: graph.source.verdict ?? null,
      tags: g.tags ?? [],
    });
  }
  return items;
}
