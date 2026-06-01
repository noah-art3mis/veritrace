# Answer layer without a fifth card rank

**Status:** accepted

## Context

#2 wants the **QA-pair made explicit** — Question → Answer → Evidence — so a question with competing answers ("Did X die?" → "Yes, died" vs "No, alive") shows the fork instead of hanging opposing evidence off the same Question. This is squarely in CONTEXT.md's spirit: _"The QA-pair (Question → answering Evidence) IS the explanation, per AVeriTeC."_ But it collides head-on with a recorded decision: CONTEXT.md retired the Sub-claim layer _"to keep the graph 4 deep"_ and says **"do not reintroduce a sub-claim layer (it would make the graph 5 deep and illegible)."** An Answer rank would make the card graph Source → Claim → Question → **Answer** → Evidence — five deep. CONTEXT.md flags this as OPEN, with viability hinging on the radial view making five rings legible where five stacked card-layers are not.

## Decision

Make the Answer an explicit **concept** without adding a fifth **card rank**, so the documented 4-deep card rule stands.

- **Derive, don't generate (initially).** An Answer is a bucket of a Question's Evidence grouped by stance (supports → "yes", refutes → "no", contextualizes → "unclear"), computed from data we already have — no new pipeline LLM stage. An explicit LLM answer-clustering stage is deferred until stance-bucketing proves insufficient.
- **Card view: a grouping inside the Question node, not a new rank.** The Question node renders its evidence under collapsed-by-default answer headers ("Yes — 3 sources", "No — 1 source"). This surfaces the fork without a fifth column and without re-introducing the legibility wall.
- **Radial view: the natural home.** In the Constellation view (ADR 0003) the answer buckets render as a sub-grouping of the evidence rim around each Question — five concentric rings are legible where five stacked card-layers are not, exactly as #2 anticipated. This is where the explicit QA-pair earns its place.
- **Verdict relation:** the winning answer bucket ≈ the Claim's existing stance-aggregated verdict — no change to `verdict.ts`. The Answer layer is a _view_ of the same aggregation, not a new source of truth.
- **The derivation is visible, not abstracted.** Because an Answer bucket is _derived_ (stance-grouped), the grouping must show its work — which evidence fell into "yes" vs "no", and why. The Answer layer is an aid to legibility, never a black box laid over the evidence. This is the project-wide **transparency principle**: every pipeline decision is visible to the Fact-checker; a _simplified_ view is welcome as an option, but hiding the decision is not.
- **Fact-check waypoints render distinctly.** Following the waypoint-only de-novo policy (CONTEXT.md), a retrieved fact-check is shown as a **high-trust waypoint** that links to the primary sources it cites — visibly flagged as a trustworthy navigation aid — never as the answer itself. Its conclusion never fills an Answer bucket or moves a Verdict; only the primaries it leads to do.

## Considered options

- **A full `AnswerItem` as a fifth card rank** — rejected: directly violates the recorded 4-deep card decision and hits the illegibility wall it was created to avoid.
- **An LLM answer-clustering stage now** — deferred: adds cost and a failure mode before we know stance-bucketing is inadequate.
- **Derived stance-buckets, rendered as in-Question grouping (cards) + rim sub-grouping (radial)** — chosen: makes the QA-pair explicit where it is legible, keeps the card graph 4 deep, and reuses the existing verdict aggregation.

## Consequences

`graph-types.ts` gains a derived Answer grouping used by the renderer (and radial), not a verdict-bearing node — so nothing downstream of the graph model changes. The feature is coupled to the radial view (now merged), satisfying the precondition CONTEXT.md set. If competing-answer documents later demand sharper clustering than stance-bucketing gives, the deferred LLM stage slots in behind the same derived interface. CONTEXT.md's "Flagged ambiguities" entry for #2 can move from OPEN to resolved-by-this-ADR.
