// Harness core: run each golden claim through the pipeline and pair its document-level
// verdict with the gold label, yielding graded items for ./score.mjs. The pipeline runner is
// INJECTED (`runOne`), so this module is key-free and unit-testable offline; the live wiring
// (collectGraph bound to real Anthropic/Exa deps) is supplied by ./run.eval.test.ts.

import { writeFileSync } from "node:fs";

/**
 * Pull the diagnostic slice out of a FactGraph: per-claim verdict + rationale and the
 * evidence stances/reliability that drove it. This is what makes a miss explainable — the
 * bare document verdict can't tell you WHY the model decided as it did. The heavy `text`
 * body is dropped; the short `passage` is kept.
 */
export function summariseGraph(graph) {
  const g = graph ?? {};
  return {
    verdict: g.source?.verdict ?? null,
    tally: g.source?.tally,
    claims: (g.claims ?? []).map((c) => ({
      id: c.id,
      text: c.text,
      verdict: c.verdict,
      rationale: c.rationale,
      checkable: c.checkable,
      checkworthy: c.checkworthy,
      relevant: c.relevant,
      date: c.date,
    })),
    questions: (g.questions ?? []).map((q) => ({ id: q.id, claimId: q.claimId, text: q.text })),
    evidence: (g.evidence ?? []).map((e) => ({
      questionId: e.questionId,
      domain: e.domain,
      url: e.url,
      stance: e.stance,
      reliability: e.reliability,
      stanceConfidence: e.stanceConfidence,
      sourceType: e.sourceType,
      passage: e.passage,
    })),
  };
}

/** Persist a results payload as pretty JSON (for the qualitative spot-check). */
export function writeResults(path, payload) {
  writeFileSync(path, JSON.stringify(payload, null, 2) + "\n");
}

/**
 * @param {Array<{id: string, claim: string, claimDate?: string, gold: {verdict: string}, tags?: string[]}>} golds
 * @param {(claimText: string, asOf?: string) => Promise<object>} runOne
 * @returns {Promise<Array<{id: string, claim: string, gold: string, predicted: string|null, tags: string[], detail: object}>>}
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
      predicted: graph.source?.verdict ?? null,
      tags: g.tags ?? [],
      detail: summariseGraph(graph),
    });
  }
  return items;
}
