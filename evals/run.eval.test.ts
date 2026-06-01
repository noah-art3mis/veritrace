// LIVE EVAL HARNESS. Runs each committed smoke gold through the real VERITRACE pipeline and
// scores the document-level verdict against the gold label. This is the thin orchestration
// layer — all the grading math lives in ./score.mjs (unit-tested, key-free). It is
// auto-SKIPPED unless BOTH ANTHROPIC_API_KEY and EXA_API_KEY are present, so it never runs in
// CI; it's a tool you invoke deliberately:
//
//   ! export $(grep -E 'ANTHROPIC_API_KEY|EXA_API_KEY' .env.local) && npm run eval:smoke
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
import { runEval } from "./run.mjs";
import { collectGraph } from "@/lib/pipeline/stream";
import { createAnthropic } from "@/lib/anthropic";
import { createExaSearch } from "@/lib/exa";
import { DEFAULT_CONFIG } from "@/lib/run-config";

const hasKeys = !!process.env.ANTHROPIC_API_KEY && !!process.env.EXA_API_KEY;
const smokePath = fileURLToPath(new URL("./golden/smoke.jsonl", import.meta.url));

describe.skipIf(!hasKeys)("smoke-set eval (live pipeline)", () => {
  it(
    "scores every gold and reports accuracy overall + by de-novo/provenance slice",
    async () => {
      const config = { ...DEFAULT_CONFIG };
      const deps = {
        ask: createAnthropic(config),
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

      const golds = loadGolden(smokePath);
      const limit = process.env.EVAL_LIMIT ? Number(process.env.EVAL_LIMIT) : golds.length;
      const subset = golds.slice(0, limit);

      const items = await runEval(subset, (claim, asOf) => collectGraph(claim, { ...deps, asOf }));

      const overall = scoreReport(items);
      const denovo = items.filter(isDeNovoCheckable);
      const provenance = items.filter((i) => !isDeNovoCheckable(i));

      const out = [formatReport(overall, `smoke — all (${items.length})`)];
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
    20 * 60_000, // up to 20 min: a full live run of all 12 golds (claim → search → verdict).
  );
});
