# ADR 0012 — One gateway entry point for every reasoning model

## Status

Accepted (2026-08-12). Supersedes the multi-backend half of ADR 0004: the _pluggable reasoning seam_ (`ReasoningProvider`, `deps.ask`) survives; the per-model backend routing does not.

## Context

ADR 0004 mapped each curated model to its own backend (Anthropic SDK, or an OpenAI-compatible endpoint per provider) with per-backend env keys and per-model thinking policies. Three costs grew with every model release:

1. **Registry churn** — GLM 5.2, Kimi K3, GPT-5.6 Luna… every new model meant a code change, and often a new backend branch plus a new env key.
2. **Thinking-mode normalization** — each provider bills and toggles reasoning differently; we accumulated a `ThinkingPolicy` enum, a per-model reserve rule, and provider-specific `reasoning_effort` mappings (#102, #110). This is exactly the class of adapter code that keeps growing.
3. **Key sprawl** — four BYO-key fields in the UI, four env vars in prod, and a routing function whose failure mode was silently billing the wrong account.

## Decision

Every reasoning call goes through **one OpenAI-compatible gateway — OpenRouter by default** — configured entirely by env:

- `OPENROUTER_API_KEY` — the single key (user-suppliable per run via the settings panel).
- `OPENROUTER_BASE_URL` — optional override; any OpenAI-compatible gateway (Vercel AI Gateway, self-hosted LiteLLM) drops in without a code change.

A model id is a gateway slug (`creator/model`). The curated registry (`lib/run-config.ts`) still exists, but it buys only a label, a cost estimate, and a verified temperature capability; **any** well-formed slug runs via the settings panel's custom-model field, so new releases work day-one with zero code.

The adapter (`lib/gateway.ts`) carries no per-provider knowledge:

- Reasoning headroom (`REASONING_TOKEN_RESERVE`) is added to every call's budget unconditionally — we can't know which models reason by default, and a higher `max_tokens` cap costs nothing on models that don't.
- The `thinking` toggle maps to the standard `reasoning_effort: "medium"`; off sends nothing (the model's default stands). We never send `"none"` — some models can't disable reasoning and reject it.
- Temperature is sent only for curated models verified to accept it; custom models omit it.

## Consequences

- `lib/anthropic.ts` (the Anthropic SDK provider) and the per-backend key routing are gone; `@anthropic-ai/sdk` is no longer a dependency. The seam types live in `lib/reasoner-types.ts`.
- The gateway's markup (OpenRouter: a fee on credit purchases) is the price of day-one model coverage and normalized reasoning semantics. Swapping to a zero-markup gateway is an env change.
- Costs shown in the picker are the gateway's, not the provider's list price.
- "Thinking off" now means "model default", not "forced off" — models that always reason (DeepSeek V4) reason regardless, which the unconditional reserve already budgets for.
