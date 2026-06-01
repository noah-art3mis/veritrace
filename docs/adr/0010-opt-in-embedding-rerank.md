# Opt-in embedding re-rank (Cohere)

**Status:** accepted

## Context

HerO's literal retrieval path embeds the hypothetical passage(s) and the candidate documents and **cosine-ranks** the candidates against the (averaged) hypothetical embedding, over a fixed corpus. VERITRACE deliberately keeps **no embeddings in the de-novo critical path** (ADR 0005) and instead fuses live-search rankings with RRF (#56, ADR 0008). Issue #57 asks for the heavier alternative: bring embeddings in for a dedicated re-rank stage. This **reverses** the no-embeddings stance, so it needs its own decision record — and it must not become the default, or the de-novo pipeline silently acquires an embedding dependency and an external API on its hot path.

## Decision

Add an **opt-in, off-by-default** embedding re-rank, gated by `RunConfig.rerank` **and** a resolvable Cohere key:

- **`lib/pipeline/rerank.ts`** — pure `cosineSimilarity` / `averageVectors`, and `createReranker({ cohereKey, embed })`. `createReranker` returns **`null` when off** (no key and no injected embed), so absence is the off switch — exactly like the fact-check short-circuit. `embed` is injectable for tests; the default calls Cohere's `/v2/embed` (`embed-v4.0`).
- **`resolveQuestion`** — when `deps.rerank` is present, the gathered candidates are embedded alongside the directional hypotheticals (HerO's averaged-hypothetical move) and the top `RERANK_POOL` by cosine are kept **before classify**. The stated classify + quality rank (`rankAndCapEvidence`) still decide the final evidence and the verdict — re-rank only changes _which candidates are scored_, never the verdict rule.
- **Resilience:** re-rank is a booster, not a gate. At/under the pool size it's a no-op (no embedding spend), and any embed failure falls back to the input order.

Default OFF means the shipped de-novo pipeline is unchanged and acquires no embedding dependency unless a user explicitly turns it on and supplies a key.

## Considered options

- **Make embedding re-rank the default retrieval ranker** — rejected: it reverses ADR 0005 for every run, adds an external API to the hot path, and #56 (RRF) already gets much of the benefit with no embeddings.
- **Cohere `/rerank` endpoint instead of embed + cosine** — viable and simpler, but the issue specifically wants the HerO embed-and-cosine path (averaging the hypothetical embeddings), which also keeps the door open to a local/other embedding backend behind the same `EmbedFn` seam. Chosen for fidelity + flexibility.

## Consequences

- A new optional config (`rerank` + `cohereKey`) and an optional `deps.rerank`. The route builds it only when `rerank` is on and a key resolves (else absent — off, no error, since it's a booster).
- **Cannot be verified end-to-end without a Cohere key**, so the unit tests mock the `embed` seam (cosine ranking, top-N selection, no-op under the limit, failure fallback). Live tuning (which pool size, embed model) is follow-up once a key is available.
- Adds a cost/latency tradeoff users opt into explicitly; the default path stays embedding-free (ADR 0005) and uses RRF (ADR 0008).
