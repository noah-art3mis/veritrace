# VERITRACE evals

Two layers: a **golden dataset** (decided claims with gold verdicts) and a **scoring harness** that runs the pipeline over those golds and grades the result.

```
evals/
  golden/            the dataset — see golden/README.md for sourcing/licensing
    load.mjs         loadGolden/parseGolden: read + validate GoldenClaim JSONL
    smoke.jsonl      12-record verdict-balanced CI fixture (the one committed gold file)
  score.mjs          grading math: accuracy, per-class recall, confusion, de-novo/provenance slice
  score.test.ts      unit tests for the grader (key-free, runs in CI)
  run.mjs            runEval(golds, runOne): pair gold vs pipeline verdict (runner injected → key-free)
  run.test.ts        unit tests for the harness core (fake runner, runs in CI)
  run.eval.test.ts   LIVE runner: real pipeline over smoke.jsonl, auto-skipped without keys
```

## What runs where

- **In CI** (`npm test`, no keys): `score.test.ts`, `run.test.ts`, and `golden/*.test.ts`. These pin the grading math and the gold→prediction mapping with fakes — no model, no network.
- **The live eval** (`run.eval.test.ts`) is `skipIf` unless **both** `OPENROUTER_API_KEY` and `EXA_API_KEY` are set, so CI always skips it. It runs each smoke gold through `collectGraph` and scores `graph.source.verdict` against the gold label.

## Running the live eval

```bash
# expose your keys to the shell, then:
export $(grep -E 'OPENROUTER_API_KEY|EXA_API_KEY' .env.local | xargs)
npm run eval:smoke              # all 12 golds (slow: claim → search → verdict each)
EVAL_LIMIT=3 npm run eval:smoke # cheap smoke of the harness itself
```

It prints accuracy overall and split into **de-novo-checkable** vs **provenance** slices (the latter — e.g. `quote-verification` claims — score ~0 by category mismatch and are reported apart so they don't drag the headline; see [golden/README.md](./golden/README.md)). A confusion matrix and the per-item misses follow.

## Design notes

- **The numbers aren't gated.** A live run's accuracy varies with the model, retrieval, and the day's web. `run.eval.test.ts` asserts only that every gold is scored and every prediction is a valid verdict or an explicit `null` — it never fails on a threshold. The signal is the printed report, not a green check.
- **A null prediction is a miss, not `nei`.** When the pipeline resolves no document verdict, the grader buckets it under `error` in the confusion matrix — "the pipeline gave up" never masquerades as a real `nei` call.
- **Known gap — temporal bounding.** `collectGraph` takes only the claim text, so retrieval isn't windowed to the gold's `claimDate`; a 2020 claim can match a 2024 source. Date-bounded retrieval needs a pipeline change (thread the date into search opts) and isn't done here.
