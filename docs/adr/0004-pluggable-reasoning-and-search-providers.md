# Pluggable reasoning + search providers

**Status:** accepted — the multi-backend routing half is superseded by [ADR 0012](./0012-single-gateway-entry-point.md) (one gateway entry point); the `ReasoningProvider` seam survives.

## Context

ADR 0001 committed to a thin "every NLP stage is an HTTP call" backend with Anthropic as the reasoner and Exa for retrieval, but both are wired in directly (`createAnthropic`, `createExaSearch`). Anthropic-frontier + Exa per run is the expensive path; cheaper backends (Claude Haiku, Gemini Flash, DeepSeek/OSS via Groq/Together for reasoning; Tavily/Brave/Bing/SerpAPI for search) would make demos and experimentation viable and lower the cost of raising the run caps. This ADR keeps the HTTP-only ethos and only makes the _which provider_ part swappable (#10).

## Decision

Introduce two narrow capability interfaces and make the current implementations the defaults:

- **`ReasoningProvider`** — the seam already half-exists as `AnthropicCaller` (`askText` / `askJSON` / `askWithTools`); promote it to a provider-neutral interface that the whole `lib/pipeline/*` depends on. Because cheaper models vary in JSON-mode reliability and the pipeline depends on reliable structured output (stance / reliability / sourceType), `askJSON` gains a **schema + validate-and-repair** step (one bounded re-ask on malformed output) so a weaker model degrades to a retry, not a crash. Allow **per-stage** model choice (cheap model for decompose/classify, stronger for verify) via config rather than a single global model.
- **`SearchProvider`** — extract today's `lib/exa.ts` behind an interface that returns the existing `RawEvidence` shape plus a **capability descriptor**: `{ returnsContent, returnsPublishedDate, returnsDomain, supportsExcludeDomains }`. Providers that don't return passage content or dates in one call degrade gracefully (a follow-up content fetch, or a documented quality note), and the de-novo honesty mechanism (`excludeDomains` over `FACT_CHECKERS`) maps onto each provider's API where supported, or is enforced as a **post-retrieval domain filter** where not — the honesty guarantee must never silently weaken.

- **`EmbeddingProvider`** (optional, deferred) — a third seam for an embeddings / rerank service (e.g. Cohere, which offers both) if retrieval ever moves from rank fusion to embedding re-rank (#57). The current absence of embeddings is the default; listed here so the provider abstraction is designed to accommodate it rather than retrofitted. Tracked separately.

The provider + per-stage model + keys are selected in `run-config.ts` and the existing settings panel (already half-built: model selector + temperature + API-keys section).

## Observability

Developer-facing tracing of model and search calls is done with **OpenTelemetry spans** around the provider seam (`deps.ask` / search) — vendor-neutral, no SaaS lock-in, consistent with the thin-HTTP ethos. Explicitly **not LangSmith** (it would couple us to the Lang ecosystem rejected below) and **not W&B** (not used here). This is a _developer_ concern; the _product's_ observability is the evidence graph itself, which the pipeline already emits as a typed event stream.

## Considered options

- **Keep direct wiring** — rejected: blocks the cost reduction that is the whole point, and re-litigates ADR 0001 every time we want to try a model.
- **A graph-orchestration framework (LangGraph / LangChain-style)** — reconsidered in depth and rejected, on real grounds (not merely "it's heavy"): the pipeline is a **bounded, fixed-depth DAG** (Source → Claims → Questions → Evidence) plus **one bounded agentic tool-loop** inside each leaf — not the cyclic, re-entrant agent a graph framework exists for, and (per ADR 0005) it is deliberately staying that way (no mid-run claim/question discovery). A framework would impose an executor we don't control over control flow that is already simple, while eroding the determinism, replay, and legibility the honesty pitch depends on — `stream.test.ts` asserts exact event order and `verdict.ts` is "STATED, not learned." We keep the home-grown async-generator orchestrator (`stream.ts`).
- **Provider-internal (hosted) web search** — using a reasoning provider's own server-side search (OpenAI's `web_search`, Anthropic's server-side `web_search`) in place of our `SearchProvider` — **rejected.** These run search on the provider's infrastructure and return the model's _synthesised answer plus citations_, **not the raw passages** VERITRACE depends on: `classify.ts` rates each retrieved source's stance / reliability / sourceType itself and feeds a _stated_, deterministic verdict rule. Hosted search moves that judgment into an opaque model step — the black box VERITRACE exists to avoid — and additionally welds retrieval to the reasoning provider (defeating the reasoning/search separation above) and is non-deterministic. (Domain filtering, which the de-novo waypoint policy needs, _is_ supported by some hosted tools, so that part would survive — but the raw-passage loss is decisive.) We keep controlled external search (Exa/Tavily/…) behind `SearchProvider`, where we own retrieval, the claim-date window, and the raw evidence we classify.

## Consequences

`deps.ask` is already an interface, so reasoning is a clean lift; search needs the new capability descriptor so callers can branch on what a provider actually returns. New surface to maintain: a provider capability matrix and the JSON validate-repair layer. The honesty mechanism becomes provider-aware — a required test per provider that fact-check sources are correctly tagged as waypoints (never `primary`, never deciding a verdict — see CONTEXT.md's refined de-novo rule), rather than silently treated as deciding evidence.
