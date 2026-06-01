# Relevance-ordered claim selection

**Status:** accepted

## Context

The pipeline is a fixed-depth, 4-layer tree — Source → Claims → Questions → Evidence — kept small by per-axis legibility caps (`maxClaims` / `maxQuestions` / `maxSources`), with an **agentic gather loop _inside_ each leaf Question** (`resolve.ts`: the model issues up to `MAX_SEARCHES` queries until it has enough evidence). The gather loop is "cyclic" in control flow but does not grow the graph — it only fills Evidence under an existing Question.

We considered growing this into a budget-bounded, best-first, **re-entrant** search (follow-up questions, recursive sub-claims, cross-claim dependencies) to tame the exponential blow-up those added axes would cause. **We decided not to** (see Considered options): the graph stays a bounded DAG and the gather loop stays as-is — "follow the existing questions to their end, and that's it." With no tree growth, the per-axis caps are sufficient and there is no exponential problem left to solve.

What remains worth fixing is one thing: `capSearchable` keeps the first `maxClaims` searchable claims **in source order**, and triage marks relevance as a **binary** gate. That over-serves whichever claims happen to appear first and under-serves the most load-bearing ones.

## Decision

Make claim selection **relevance-ranked**, not first-come:

- **Triage emits a relevance _score_, not a binary gate.** `triage.ts` already reasons about relevance (load-bearing vs trivial background); expose it as a score (expected impact × contestedness) instead of `relevant: true|false`.
- **`maxClaims` caps the top of the relevance-ordered list.** Sort searchable claims by score, keep the top `maxClaims`, demote the rest — replacing `capSearchable`'s source-order slice.
- **Dropped claims stay visible** — shown greyed and now _ranked_, per the transparency principle (CONTEXT.md). Nothing is hidden: the user sees the full decomposition and the order we prioritised it in.

The agentic gather loop, `classify.ts`, and `verdict.ts` are **unchanged**.

## Considered options

- **Budget-bounded best-first search over a _growing_ graph** (global retrieval budget replacing per-axis caps; a priority frontier replacing `Promise.all`; iterative deepening; confidence-gated pruning; a transposition table) — **rejected / deferred.** Its entire premise is that the search _grows_ (follow-up questions, recursive sub-claims, cross-claim dependencies) and goes exponential, the classic full-width-minimax wall. We chose instead to keep the graph a fixed 4-layer tree with **no mid-run claim/question discovery**, so the blow-up never arises and the frontier/budget machinery is unwarranted complexity. If the graph ever becomes re-entrant, revisit this — but the recursion-shape question (CONTEXT.md) must be settled first.
- **Keep the binary relevance gate + source-order cap** — rejected: over-serves early claims, under-serves load-bearing ones, for no benefit.

## Consequences

A small, contained change: `triage.ts` returns a relevance score and `capSearchable` sorts before slicing. No change to `stream.ts` orchestration, the gather loop, `classify.ts`, or `verdict.ts`. Retrieval-expansion improvements (RRF over the two-way HyDE split, #56; embedding re-rank, #57) and any future provenance-tracing are tracked separately, not folded in here.
