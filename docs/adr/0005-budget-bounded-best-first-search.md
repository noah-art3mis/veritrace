# Budget-bounded best-first search, not full-width fan-out

**Status:** proposed

## Context

The pipeline is structurally a fixed-depth, full-width, uniform-cost tree search: `stream.ts` does `allQuestions.map(...)` under `Promise.all`, expanding **every** branch to full depth regardless of value. Worst case ≈ `maxClaims × maxQuestions × MAX_SEARCHES × maxSources` ≈ 4,000 retrievals, each an LLM **and** an Exa call. It is only tolerable because the per-axis hard caps keep the tree small — we survive by keeping the search tiny, not by searching intelligently. The moment we add the axes we want next (follow-up questions, recursive sub-claims, cross-claim dependencies) depth grows and it goes exponential — the classic full-width-minimax wall (#11).

## Decision

Shift from `O(claims × questions × searches)` to `O(budget)`, steered at the highest-value nodes — the same move chess made from full-width minimax to alpha-beta + iterative deepening + quiescence. Sequenced highest-leverage / lowest-risk first, each independently shippable:

1. **Global budget replaces per-axis caps.** One run-level budget (N retrievals, or a cost/latency ceiling) in `run-config.ts`, instead of independent `maxClaims/maxQuestions/MAX_SEARCHES/maxSources`. Per-axis caps over-constrain easy claims and under-serve hard ones.
2. **Triage becomes a priority _score_, not a binary gate.** `triage.ts` already computes checkworthy / checkable / relevance; expose relevance as a **score** (expected impact × uncertainty) instead of `capSearchable`'s yes/no. **`maxClaims` then caps the top of the relevance-ordered list**, rather than keeping the first N claims in source order — so easy/trivial claims don't crowd out the load-bearing ones. Dropped claims are still shown (greyed, and now _ranked_), per the transparency principle.
3. **Best-first frontier replaces the uniform `Promise.all`.** A bounded frontier in `stream.ts`: pop the highest-value node, expand, re-score, repeat until the budget is spent or confidence is reached. This is exactly a focused-crawler frontier (prior art to cite).
4. **Iterative deepening.** One shallow breadth-first pass first (1 question / 1 search → provisional verdict + confidence) that **streams provisional verdicts immediately**, then deepen only the uncertain / high-impact frontier until budget is gone. The streaming UI rewards this for free — the "anytime" property.
5. **Confidence-gated depth + upward pruning.** Generalize the existing leaf-level `MIN_DECIDING=2` early-stop into an SPRT-style support-vs-refute likelihood test (stop the instant confidence crosses threshold), and add a source-level alpha-beta early-out: once the aggregate source verdict is locked, stop burning budget on remaining low-impact claims.
6. **Transposition table.** Extend URL dedup into semantic claim/question dedup across the document (and cached across runs), so a repeated fact is searched once.

Phase 1 (items 1–3) is the smallest real change and leaves classify/verdict logic untouched.

### The cyclic endgame (observe-only)

Items 3–4 turn the orchestrator into a **re-entrant frontier**: expanding a node can enqueue new nodes — including new checkable claims surfaced while resolving a question. This is the cyclic-agent direction the project is committing to, but **observe-only**: the Fact-checker watches the graph build and renders the final verdict; they do **not** steer, pause, or redirect the search mid-run (recompute-on-distrust stays a stretch, per CONTEXT.md). That observe-only constraint is precisely why the orchestrator stays a home-grown plain-TS loop rather than a graph framework — LangGraph's interrupt/resume HITL, its biggest draw, is out of scope (see ADR 0004).

**OPEN — recursion shape.** When resolving a question surfaces a new checkable claim, does it (a) become a new **top-level Claim** added to the existing Claims layer (graph stays 4-deep; compatible with ADR 0006), or (b) nest _under_ its parent as a deeper layer (5-deep, reviving the retired Sub-claim and colliding with ADR 0006)? **(a) is strongly preferred; (b) is not yet ruled in.** This must be settled before the re-entrant frontier lands.

### Budget governs _how much_, not _how well-sourced_

A run budget bounds breadth/depth allocation; it does **not**, by itself, get the pipeline to the **originating source**. Reaching the origin is an orthogonal axis — _provenance-tracing_ — that the pipeline currently only gestures at: it asks the gather agent for "a primary source" and tags `sourceType`, with no mechanism to follow a citation chain back to the origin. The **fact-check-as-waypoint** policy (CONTEXT.md / ADR 0006) is the intended lever: a fact-check is read to find the primaries it cites, then those are followed to the origin. Provenance-tracing should be designed as its own capability, not assumed to fall out of a larger budget.

### Retrieval expansion (RRF)

Within a single question's gather step, the HyDE expansion runs as **two directional queries — one confirm, one refute (#13)** — fused by **Reciprocal Rank Fusion** rather than a single concatenated seed (#56). This is the live-search-API analogue of HyDE/HerO's embedding-averaging, which needs a controlled index we don't have (we hand Exa _text_, not vectors). N stays at 2; the embedding re-rank path is deferred (#57). RRF must use a fixed `k` and deterministic tie-breaking so the frontier and the pipeline tests stay reproducible.

## Considered options

- **Keep per-axis caps** — rejected: over-constrains easy claims, under-serves hard ones, and goes exponential the moment depth grows.
- **MCTS / UCB1 bandit allocation** — deferred: the right mental model for "where does the next dollar go", but overkill until best-first ordering proves insufficient.

## Consequences

The single biggest structural change is the `stream.ts` orchestrator; classify/verdict stay put initially. The frontier and scoring must remain **deterministic** so the streaming and pipeline tests stay reproducible (no wall-clock / RNG in ordering). Provisional-then-refined verdicts change the event stream contract slightly — the UI must tolerate a claim verdict updating. Big upside: cost scales with a budget we set, not with the document's shape.
