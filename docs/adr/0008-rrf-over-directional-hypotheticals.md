# Reciprocal Rank Fusion over directional hypotheticals

**Status:** accepted

## Context

HyDE (Gao et al. 2022) and HerO (Yoon et al. 2024, AVeriTeC runner-up) improve retrieval by generating _N_ hypothetical passages that would answer a query and **averaging their embedding vectors** before dense retrieval over a fixed, controlled corpus (HerO's "knowledge store", N=8). See `docs/papers/`.

VERITRACE retrieves from a **live search API (Exa)**: we hand over _text_, not vectors, and there is no fixed index to embed against. So embedding-averaging has nowhere to live at the retrieval boundary. ADR 0005 already committed to keeping **no embeddings in the critical path**. Yet we do generate two directional hypotheticals — one shaped like a source that would CONFIRM the claim, one that would REFUTE it (#13, generalised in #59) — and, before this change, we concatenated them into a single seed query handed to the agentic gather loop. That throws away the per-direction signal: a source strongly implied by _both_ directions is no more likely to be retrieved than one a single direction surfaced by fluke.

## Decision

Issue **one Exa query per directional hypothetical** (plus the bare question), then fuse the result rankings with **Reciprocal Rank Fusion** (Cormack et al. 2009):

```
score(d) = Σ_i 1 / (k + rank_i(d))            k = 60 (RRF_K), rank 0-based
```

This is the live-search-API analogue of HyDE/HerO's embedding-averaging — **averaging over rankings instead of vectors**, requiring no embeddings. A document ranked well across multiple directional queries floats to the top; a fluke that only one query surfaced washes out. To our knowledge neither HyDE nor HerO fuses hypotheticals via rank fusion over **live web search** (they average embeddings over a frozen index), so this is framed as the project's retrieval contribution.

- `lib/pipeline/rrf.ts` — pure `reciprocalRankFusion(rankings, key, k)`. Deterministic: fixed `k`, stable first-seen tie-break, so the pipeline/streaming tests stay reproducible (ADR 0005's determinism constraint).
- `lib/pipeline/expand.ts` — `expandQuery` now exposes the directional passages as `anchors` (each a standalone query; they already carry the entities/date).
- `lib/pipeline/resolve.ts` — the gather loop is **seeded** by RRF over `[question, ...anchors]`; the fused sources populate the deduped pool, and the model then drives follow-up searches as before. The agentic loop, `classify.ts`, and `verdict.ts` are otherwise unchanged.

`RRF_K = 60` is the canonical constant; it damps the weight of any one query's exact rank so that **presence across directions** matters more than topping a single list. It is provisional — the smoke-set eval (needs live keys) can tune it.

## Considered options

- **Keep concatenating both hypotheticals into one seed query** — rejected: it's what discards the cross-direction signal RRF recovers, and it leaves the "novelty" claim unbacked.
- **Embedding-space re-rank (the literal HerO path; Cohere embed+rerank)** — deferred to #57. It reverses "no embeddings in the critical path" and needs an external embedding API; RRF gets most of the benefit with neither cost.
- **N-way hypotheticals (HerO parity, N=8)** — out of scope; the 2-way confirm/refute split stays the default (#13). N-way is a separate, benchmarkable enhancement (the closed #58).

## Consequences

Each question now issues a few extra deterministic seed searches (one per direction + the question) before the agentic loop, slightly increasing Exa calls per question but improving recall of cross-direction sources. The RRF ordering seeds the pool; final evidence is still re-ranked by the stated quality score (`rankAndCapEvidence`) and capped, so RRF affects _which_ sources are gathered, not the verdict rule. Embedding-based re-rank (#57) remains the heavier alternative, tracked separately.
