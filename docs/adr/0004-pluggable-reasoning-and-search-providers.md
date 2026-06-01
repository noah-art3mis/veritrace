# Pluggable reasoning + search providers

**Status:** proposed

## Context

ADR 0001 committed to a thin "every NLP stage is an HTTP call" backend with Anthropic as the reasoner and Exa for retrieval, but both are wired in directly (`createAnthropic`, `createExaSearch`). Anthropic-frontier + Exa per run is the expensive path; cheaper backends (Claude Haiku, Gemini Flash, DeepSeek/OSS via Groq/Together for reasoning; Tavily/Brave/Bing/SerpAPI for search) would make demos and experimentation viable and lower the cost of raising the run caps. This ADR keeps the HTTP-only ethos and only makes the _which provider_ part swappable (#10).

## Decision

Introduce two narrow capability interfaces and make the current implementations the defaults:

- **`ReasoningProvider`** — the seam already half-exists as `AnthropicCaller` (`askText` / `askJSON` / `askWithTools`); promote it to a provider-neutral interface that the whole `lib/pipeline/*` depends on. Because cheaper models vary in JSON-mode reliability and the pipeline depends on reliable structured output (stance / reliability / sourceType), `askJSON` gains a **schema + validate-and-repair** step (one bounded re-ask on malformed output) so a weaker model degrades to a retry, not a crash. Allow **per-stage** model choice (cheap model for decompose/classify, stronger for verify) via config rather than a single global model.
- **`SearchProvider`** — extract today's `lib/exa.ts` behind an interface that returns the existing `RawEvidence` shape plus a **capability descriptor**: `{ returnsContent, returnsPublishedDate, returnsDomain, supportsExcludeDomains }`. Providers that don't return passage content or dates in one call degrade gracefully (a follow-up content fetch, or a documented quality note), and the de-novo honesty mechanism (`excludeDomains` over `FACT_CHECKERS`) maps onto each provider's API where supported, or is enforced as a **post-retrieval domain filter** where not — the honesty guarantee must never silently weaken.

The provider + per-stage model + keys are selected in `run-config.ts` and the existing settings panel (already half-built: model selector + temperature + API-keys section).

## Considered options

- **Keep direct wiring** — rejected: blocks the cost reduction that is the whole point, and re-litigates ADR 0001 every time we want to try a model.
- **A heavy framework (LangChain-style)** — rejected: violates ADR 0001's thin-HTTP ethos; we want two ~20-line interfaces, not an abstraction layer.

## Consequences

`deps.ask` is already an interface, so reasoning is a clean lift; search needs the new capability descriptor so callers can branch on what a provider actually returns. New surface to maintain: a provider capability matrix and the JSON validate-repair layer. The honesty mechanism becomes provider-aware — a required test per provider that fact-check domains are actually excluded.
