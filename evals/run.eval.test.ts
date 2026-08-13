// LIVE EVAL HARNESS. Runs each committed smoke gold through the real VERITRACE pipeline and
// scores the document-level verdict against the gold label. This is the thin orchestration
// layer — all the grading math lives in ./score.mjs (unit-tested, key-free). It is
// auto-SKIPPED unless BOTH OPENROUTER_API_KEY and EXA_API_KEY are present, so it never runs in
// CI; it's a tool you invoke deliberately:
//
//   ! export $(grep -E 'OPENROUTER_API_KEY|EXA_API_KEY' .env.local) && npm run eval:smoke
//
// EVAL_LIMIT=3 caps how many golds run (a fast, cheap smoke of the harness itself).
//
// Temporal bounding: each gold's claimDate is passed as the pipeline's `asOf` date, so triage
// anchors date inference to the claim's era and retrieval is windowed around it — a 2020 claim
// won't pull 2024 debunks.

import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { loadGolden, GOLDEN_VERDICTS } from "./golden/load.mjs";
import { scoreReport, formatReport, isDeNovoCheckable } from "./score.mjs";
import { runEval, writeResults } from "./run.mjs";
import { collectGraph } from "@/lib/pipeline/stream";
import { createReasoner } from "@/lib/reasoner";
import { createExaSearch } from "@/lib/exa";
import { DEFAULT_CONFIG } from "@/lib/run-config";

const hasKeys = !!process.env.OPENROUTER_API_KEY && !!process.env.EXA_API_KEY;
// EVAL_FILE selects the gold set under evals/golden/ (default the committed smoke set); pass a
// bare filename or an absolute path. EVAL_LIMIT caps how many golds run.
const evalFile = process.env.EVAL_FILE ?? "smoke.jsonl";
const goldPath = evalFile.startsWith("/")
  ? evalFile
  : fileURLToPath(new URL(`./golden/${evalFile}`, import.meta.url));
const setName = evalFile.replace(/^.*\//, "").replace(/\.jsonl$/, "");

describe.skipIf(!hasKeys)("gold-set eval (live pipeline)", () => {
  it(
    "scores every gold and reports accuracy overall + by de-novo/provenance slice",
    async () => {
      const config = { ...DEFAULT_CONFIG };
      const deps = {
        ask: createReasoner(config),
        search: createExaSearch({
          exaKey: config.exaKey,
          numResults: config.maxSources,
          maxChars: config.maxChars,
          deepSearch: config.deepSearch,
          category: config.category,
          preferFresh: config.preferFresh,
        }),
        maxClaims: config.maxClaims,
        maxQuestions: config.maxQuestions,
      };

      const golds = loadGolden(goldPath);
      const limit = process.env.EVAL_LIMIT ? Number(process.env.EVAL_LIMIT) : golds.length;
      const subset = golds.slice(0, limit);

      const items = await runEval(subset, (claim, asOf) => collectGraph(claim, { ...deps, asOf }));

      const overall = scoreReport(items);
      const denovo = items.filter(isDeNovoCheckable);
      const provenance = items.filter((i) => !isDeNovoCheckable(i));

      const out = [formatReport(overall, `${setName} — all (${items.length})`)];
      if (denovo.length)
        out.push(formatReport(scoreReport(denovo), `de-novo-checkable (${denovo.length})`));
      if (provenance.length)
        out.push(
          formatReport(scoreReport(provenance), `provenance — expected ~0 (${provenance.length})`),
        );
      out.push("\nconfusion (gold → predicted):\n" + JSON.stringify(overall.confusion, null, 2));
      out.push(
        "\nmisses:\n" +
          items
            .filter((i) => i.predicted !== i.gold)
            .map((i) => `  ${i.gold} → ${i.predicted ?? "—"}  ${i.id}`)
            .join("\n"),
      );
      console.log("\n" + out.join("\n\n") + "\n");

      // Persist the FULL per-claim detail (verdict + rationale + evidence stances) so a low
      // score can be diagnosed qualitatively — the console report only carries verdicts.
      const resultsPath = fileURLToPath(
        new URL(`./golden/${setName}.results.json`, import.meta.url),
      );
      writeResults(resultsPath, { model: config.model, set: setName, report: overall, items });
      console.log(`full per-claim detail → ${resultsPath}`);

      // Stable assertions (the numbers themselves vary run-to-run, so we don't gate on them):
      // the harness must score every gold and only ever emit a real verdict or an explicit null.
      expect(items).toHaveLength(subset.length);
      for (const i of items) {
        expect(i.predicted === null || GOLDEN_VERDICTS.includes(i.predicted)).toBe(true);
      }
      expect(overall.accuracy === null || (overall.accuracy >= 0 && overall.accuracy <= 1)).toBe(
        true,
      );
    },
    60 * 60_000, // generous: a live run is ~20-30s/gold, and a larger EVAL_FILE can be 40+.
  );
});
