# Pipeline limits, caps & tuning knobs

A catalogue of every value that silently bounds what VERITRACE retrieves, reads, and counts toward a verdict. Some are user-configurable (surfaced in the settings panel); most are hardcoded constants. This doc exists because several of these decisions are invisible from the UI yet materially change the result — e.g. a source can be retrieved, classified, and then dropped before it ever influences a verdict. When something surprises you ("why didn't it use that source?"), start here.

Values current as of this writing — grep the cited symbol if in doubt.

## Configurable (surfaced in the settings panel)

These are threaded UI → `runConfig()` → `parseConfig` (`lib/run-config.ts`) → the pipeline. Defaults live in `DEFAULT_CONFIG`; ranges are enforced server-side.

| Setting             | Symbol / param                           | Range                      | Default           | Effect                                                                                                        |
| ------------------- | ---------------------------------------- | -------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| Model               | `model`                                  | gateway slug               | DeepSeek V4 Flash | Which model runs every reasoning call — curated dropdown or any custom gateway slug (ADR 0012).               |
| Temperature         | `temperature`                            | 0–1                        | 0                 | Sampling determinism. Inert when thinking is on or the model deprecates it.                                   |
| Extended thinking   | `thinking`                               | on/off                     | off               | Maps to gateway `reasoning_effort: "medium"`; off leaves the model's own default (ADR 0012).                  |
| Claims to extract   | `maxClaims`                              | 1–10                       | 5                 | How many atomic claims are kept from the source text.                                                         |
| Questions per claim | `maxQuestions`                           | 1–10                       | 2                 | Resolving questions each claim fans out into.                                                                 |
| Sources per search  | `maxSources` → Exa `numResults`          | 1–10                       | 2                 | Results returned per Exa search call.                                                                         |
| Read depth          | `maxChars` → Exa `text.maxCharacters`    | 200–10000                  | 6000              | How much of each source's body the **classifier** reads. See note below.                                      |
| Deep search         | `deepSearch` → Exa `type`                | on/off                     | off               | `"deep"` (agentic) vs `"auto"`. Higher recall, slower, pricier.                                               |
| Depth mode          | `depthMode` → `deps.depth`               | on/off                     | off               | Swaps the breadth fan-out for a link-following walk toward the origin (ADR 0011). Renders as the spiral view. |
| Source category     | `category` → Exa `category`              | ""/news/research paper/pdf | ""                | Restrict retrieval to a content type for cleaner extraction; narrows recall.                                  |
| Prefer fresh        | `preferFresh` → Exa `contents.livecrawl` | on/off                     | off               | `"preferred"` live-crawls over cache. Fresher for breaking news, slower.                                      |

### Read depth note — the highlight/text split

`maxChars` only became load-bearing once `RawEvidence` was split into two fields (`lib/exa.ts`):

- `passage` — a short, **question-focused** Exa highlight (`HIGHLIGHT_CHARS = 512`). This is what each evidence card shows.
- `text` — the fuller page body up to `maxChars`. This is what `classify.ts` actually feeds the model.

Before the split, `passage = highlight || text` meant the classifier read only the short highlight and the fetched body was discarded — so the Read-depth slider did almost nothing. If you revert to a single field, that silent inertness comes back.

## Hardcoded retrieval & gather limits (not surfaced)

| Symbol                      | File            | Value   | What it silently does                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | --------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EVIDENCE_PER_QUESTION_CAP` | `resolve.ts`    | 6       | **Load-bearing.** Only the top 6 ranked sources per question survive into the verdict and the graph. Sources beyond 6 are still retrieved and classified (you pay for them), then dropped. The verdict literally cannot see source #7+. Ranking pins the best deciding `supports` and `refutes` first so a lone refutation isn't crowded out. |
| `MAX_SEARCHES`              | `resolve.ts`    | 4       | The gather agent gets at most 4 search round-trips per question, even if the evidence bar isn't met.                                                                                                                                                                                                                                          |
| `MIN_DECIDING`              | `resolve.ts`    | 2       | Target: keep searching until ≥2 reliable deciding sources (incl. ≥1 primary). A goal the model is told to hit, backstopped by `MAX_SEARCHES`.                                                                                                                                                                                                 |
| `MAX_DEPTH_HOPS`            | `run-config.ts` | 6       | **Depth mode only.** The link-following walk follows at most 6 links toward the origin before it stops and judges what it holds — the depth analogue of `MIN_DECIDING`. Backstops the model-driven walk.                                                                                                                                      |
| `DEPTH_LINKS_PER_SOURCE`    | `run-config.ts` | 12      | **Depth mode only.** How many outbound links (Exa `extras.links`) are pulled off each visited page to form the next-hop frontier; the rest are deduped away. The agent picks the most origin-likely one.                                                                                                                                      |
| `WINDOW_BEFORE_DAYS`        | `resolve.ts`    | 30      | **Load-bearing.** Sources published >30 days before the claim's event date are filtered out by Exa. A relevant older source is invisible.                                                                                                                                                                                                     |
| `WINDOW_AFTER_DAYS`         | `resolve.ts`    | 14      | **Load-bearing.** Sources published >14 days after the event date are filtered out. Only applies when the claim has a parsed date.                                                                                                                                                                                                            |
| `HIGHLIGHT_CHARS`           | `exa.ts`        | 512     | Length of the card excerpt (display only — does not affect classification).                                                                                                                                                                                                                                                                   |
| `SEGMENT_CEILING`           | `segment.ts`    | 16      | Max segments the source text is split into.                                                                                                                                                                                                                                                                                                   |
| `FACT_CHECKERS` exclusion   | `exa.ts`        | **OFF** | The de-novo "don't read other fact-checks" exclusion is currently disabled (commented out) so the pipeline can reach primary sources via a fact-check's citations. Re-add `excludeDomains: FACT_CHECKERS` to restore the strict bar.                                                                                                          |

## Verdict gating thresholds (load-bearing)

These decide whether a piece of evidence can move a verdict at all (`lib/pipeline/verdict.ts`, `isDeciding`). Uncertainty is modelled as **source reliability**, not a bare confidence number.

| Symbol                    | Value           | What it does                                                                                                                                                              |
| ------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MIN_STANCE_CONFIDENCE`   | 0.5             | Evidence whose classifier stance-confidence is below 0.5 cannot decide — it can only contextualize.                                                                       |
| `DECIDING_RELIABILITY`    | {high, medium}  | Only high/medium reliability sources establish or flip a verdict. A **low**-reliability source (blog, social aggregator, anonymous) can only contextualize, never decide. |
| `PRIVILEGED_HIGH_DOMAINS` | [wikipedia.org] | `classify.ts` forces these domains to "high" reliability regardless of the model's call.                                                                                  |

Consequence: a claim with only low-reliability or low-confidence evidence resolves to **Not-Enough-Evidence**, even if every source agrees. This is intentional (the de-novo honesty bar) but invisible from the graph unless you read the reliability meters.

## Per-stage model token caps

Output-token ceilings on each Anthropic call. Mostly sized to fit the expected output; the classify cap is the one most at risk of truncation when many sources are gathered.

| Stage     | File           | `maxTokens` |
| --------- | -------------- | ----------- |
| expand    | `expand.ts`    | 200         |
| questions | `questions.ts` | 600         |
| segment   | `segment.ts`   | 1500        |
| gather    | `resolve.ts`   | 600         |
| classify  | `classify.ts`  | 2048        |
| summarize | `summarize.ts` | 700         |

Every stage's real request ceiling is its listed value **plus `REASONING_TOKEN_RESERVE` (4096, `run-config.ts`)** — the gateway adapter adds the reserve unconditionally so a model that reasons by default can't consume the whole budget and return empty content (ADR 0012).

## Known-issue cross-references

- Garbled passage text from Exa extraction (binary/PDF/SPA): issues #2 and #3. Relevant here because higher Read depth feeds proportionally more of any garbled body to the classifier — the issue-#3 sanitization gate becomes more important as `maxChars` rises.

## Candidates to surface as settings

If "why didn't it use that source?" keeps surprising users, the highest-value knobs to promote from hardcoded to configurable are `EVIDENCE_PER_QUESTION_CAP` (verdict can't see past the top 6) and the date window (`WINDOW_BEFORE_DAYS` / `WINDOW_AFTER_DAYS`). Both directly determine which evidence is allowed to count.
