# Budget-bounded best-first search, not full-width fan-out

**Status:** proposed

## Context

The pipeline is structurally a fixed-depth, full-width, uniform-cost tree search: `stream.ts` does `allQuestions.map(...)` under `Promise.all`, expanding **every** branch to full depth regardless of value. Worst case ≈ `maxClaims × maxQuestions × MAX_SEARCHES × maxSources` ≈ 4,000 retrievals, each an LLM **and** an Exa call. It is only tolerable because the per-axis hard caps keep the tree small — we survive by keeping the search tiny, not by searching intelligently. The moment we add the axes we want next (follow-up questions, recursive sub-claims, cross-claim dependencies) depth grows and it goes exponential — the classic full-width-minimax wall (#11).

## Decision

Shift from `O(claims × questions × searches)` to `O(budget)`, steered at the highest-value nodes — the same move chess made from full-width minimax to alpha-beta + iterative deepening + quiescence. Sequenced highest-leverage / lowest-risk first, each independently shippable:

1. **Global budget replaces per-axis caps.** One run-level budget (N retrievals, or a cost/latency ceiling) in `run-config.ts`, instead of independent `maxClaims/maxQuestions/MAX_SEARCHES/maxSources`. Per-axis caps over-constrain easy claims and under-serve hard ones.
2. **Triage becomes a priority _score_, not a binary gate.** `triage.ts` already computes checkworthy / checkable / relevance; expose it as a score (expected impact × uncertainty) instead of `capSearchable`'s yes/no.
3. **Best-first frontier replaces the uniform `Promise.all`.** A bounded frontier in `stream.ts`: pop the highest-value node, expand, re-score, repeat until the budget is spent or confidence is reached. This is exactly a focused-crawler frontier (prior art to cite).
4. **Iterative deepening.** One shallow breadth-first pass first (1 question / 1 search → provisional verdict + confidence) that **streams provisional verdicts immediately**, then deepen only the uncertain / high-impact frontier until budget is gone. The streaming UI rewards this for free — the "anytime" property.
5. **Confidence-gated depth + upward pruning.** Generalize the existing leaf-level `MIN_DECIDING=2` early-stop into an SPRT-style support-vs-refute likelihood test (stop the instant confidence crosses threshold), and add a source-level alpha-beta early-out: once the aggregate source verdict is locked, stop burning budget on remaining low-impact claims.
6. **Transposition table.** Extend URL dedup into semantic claim/question dedup across the document (and cached across runs), so a repeated fact is searched once.

Phase 1 (items 1–3) is the smallest real change and leaves classify/verdict logic untouched.

## Considered options

- **Keep per-axis caps** — rejected: over-constrains easy claims, under-serves hard ones, and goes exponential the moment depth grows.
- **MCTS / UCB1 bandit allocation** — deferred: the right mental model for "where does the next dollar go", but overkill until best-first ordering proves insufficient.

## Consequences

The single biggest structural change is the `stream.ts` orchestrator; classify/verdict stay put initially. The frontier and scoring must remain **deterministic** so the streaming and pipeline tests stay reproducible (no wall-clock / RNG in ordering). Provisional-then-refined verdicts change the event stream contract slightly — the UI must tolerate a claim verdict updating. Big upside: cost scales with a budget we set, not with the document's shape.
