# Pluggable search provider

**Status:** accepted

## Context

ADR 0004 made the **reasoning** side provider-neutral: the pipeline depends on a `ReasoningProvider` and `createReasoner` routes to a backend (Anthropic / OpenAI-compatible) by the selected model. The **search** side never got the same treatment — `createExaSearch` was imported and called directly in the API routes, hard-wiring Exa. Issue #10 asks to abstract both external services so the search backend can be swapped and cheaper alternatives added, keeping ADR 0001's "every NLP/retrieval stage is an HTTP call" ethos.

## Decision

Introduce a provider-neutral search seam mirroring the reasoning seam:

- **`lib/search.ts`** — `SearchFn` (the `(query, opts) => Promise<RawEvidence[]>` unit the gather loop calls), a `SearchCapabilities` descriptor (`deepSearch`, `categories`, `freshCrawl`), and `SearchProvider = { name, capabilities, search }`.
- **`createSearchProvider(config)`** — the factory the API routes call instead of `createExaSearch`. It routes to a backend and returns the provider-neutral `SearchProvider`. Today the only backend is Exa (`createExaSearch` becomes its implementation detail); a second backend slots in here without touching the gather loop, `resolve.ts`, or `deps`.
- The pipeline keeps depending on `deps.search: SearchFn` — unchanged — so nothing downstream knows which backend ran.

The **capabilities descriptor** exists so the settings UI can disable options a backend can't do (e.g. hide "deep search" / the category filter for a backend without them). That UI wiring is the immediate follow-up; the descriptor is defined now so the seam is complete.

## Considered options

- **Leave `createExaSearch` wired directly in the routes** — rejected: it's the asymmetry #10 calls out, and it means a second backend can't be added without editing every call site.
- **Over-build now: ship a second backend + per-stage model selection in this change** — rejected/deferred. A second search backend needs a concrete provider (a free/cheaper search API + key) to be real rather than speculative; per-stage model choice is a distinct config surface. Both are tracked as follow-ups so this ADR stays the minimal seam, not a speculative framework.

## Consequences

- `app/api/check` and `app/api/resolve-claim` build `deps.search` via `createSearchProvider(...).search`. No behaviour change — Exa is still the backend with identical config.
- Adding a backend is now local: implement a `SearchFn` + capabilities and route to it in `createSearchProvider` (by a `config` field, like `createReasoner` routes by model).
- **Remaining #10 scope (follow-ups, not closed here):** (1) a concrete second/cheaper search backend; (2) per-stage model selection (different models for triage vs classify vs gather); (3) the settings-UI consumption of `SearchCapabilities`. These need product decisions or external providers, not just code.
