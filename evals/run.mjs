// Harness core: run each golden claim through the pipeline and pair its document-level
// verdict with the gold label, yielding graded items for ./score.mjs. The pipeline runner is
// INJECTED (`runOne`), so this module is key-free and unit-testable offline; the live wiring
// (collectGraph bound to real Anthropic/Exa deps) is supplied by ./run.eval.test.ts.

/**
 * @param {Array<{id: string, claim: string, gold: {verdict: string}, tags?: string[]}>} golds
 * @param {(claimText: string) => Promise<{source: {verdict: string|null}}>} runOne
 * @returns {Promise<Array<{id: string, claim: string, gold: string, predicted: string|null, tags: string[]}>>}
 */
export async function runEval(golds, runOne) {
  const items = [];
  for (const g of golds) {
    const graph = await runOne(g.claim);
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
