# Radial "Constellation" view: an additive overview rendering of the Evidence graph

**Status:** accepted (design — implementation tracked on `claude/radial-graph-enhancement-NTXn2` and related issues)

## Context

The default card-based Evidence graph (dagre left-to-right layout, React Flow) becomes hard to read when an investigation is large: Evidence is the populous rank, cards stack, and `fitView` zooms everything down to an illegible field of boxes (the `EV_COLS` grid hack in `lib/graph-to-flow.ts` already fights this). We want a way to read the _shape_ of a big investigation at a glance — without sacrificing the "shows its work" detail the cards provide.

## Decision

Add a **Constellation view**: an **additive, radial overview** rendering of the same four layers (Source → Claims → Questions → Evidence). It is **not** a replacement for the cards, which stay the default and remain _the_ explanation. The specific choices:

- **Scope.** Additive view mode. A circle is a way _into_ a node — click opens its existing card — never a replacement for it. **Manual toggle**, card view default; may **auto-suggest** switching once node count crosses a threshold.
- **Geometry.** Deterministic radial tidy tree: Source at the centre, Claims → Questions → Evidence on successive rings. Each Claim owns an **angular wedge sized by its leaf (Evidence) count**, subdividing into its Questions and their Evidence, so a claim's whole subtree is one readable pie-slice. Depth = radius, so any circle's layer is readable from its ring alone.
- **Circle encoding** (one channel per signal, to keep a small dot legible):
  - **Fill** = the layer's semantic axis — **Verdict** for Source/Claim, **Stance** for Evidence. Questions stay neutral/cyan (process status), **never** red/green (preserves the `visuals.ts` discipline that only verdict+stance are saturated).
  - **Halo ring** = **reliability** (high/med/low). Not opacity — opacity already means "dropped/segmented-out" on claim cards.
  - **Star** = **deciding evidence** (on the Evidence ring) and **refuted claims** (on the Claim ring) — the load-bearing finds and the debunked claims a Fact-checker hunts for. (Conflicting claims keep their amber fill; they are not starred.)
  - **Size** = depth/layer only (Source largest → Evidence smallest). Encodes no data metric.
- **Edges.** Structural links are faint and light a node's full lineage (Source→…→Evidence) on peek. Stance **text labels are kept** (they double as a non-colour read of stance) but rendered **zoom/collision-aware** — hidden when they would overlap at far zoom, fading in as you zoom into a region or on peek. The **conflict overlay** is drawn as always-on (faint) **interior chords** between the two opposing deciding sources — the one edge that encodes what position doesn't.
- **Interaction (peek-then-open, identical on every device).** Hover (desktop) or **tap** (touch) reveals a **pinned detail strip** that spells the colour out in words (colourblind-safe — see issue #8); click / second-tap opens the node's card. No hover-only reveal, because touch has no hover.
- **Streaming.** Wedges use strict **leaf-count proportions** throughout the live build, with the reflow **tweened** on each evidence burst. The tween uses **spring/force easing** (an Obsidian-style settle) and circles are drag-springable. Force is the **animation feel only — never the layout engine**; the radial layout stays the source of truth so the four layers never dissolve.
- **Implementation.** Keep React Flow. Render circles as a new `nodeType` and swap `computeLayout()` (the dagre call in `graph-to-flow.ts`) for a **hand-rolled `radialLayout()`** behind the view toggle. No new dependency. Reuses pan/zoom, `onlyRenderVisibleElements`, the MiniMap, edge routing, the `useGraphFlow` cache, and node-position animation (which gives the tween for free).

## Considered options (rejected)

- **Replace the cards entirely** — no. The cards are the headline "shows its work" differentiator; an info-hidden overview can't carry the explanation.
- **Force-directed blob layout (true Obsidian-style)** — no. It dissolves the four layers, which `CONTEXT.md` insists _are_ the explanation. Force is retained only as transition easing.
- **Cap-based stable slots during streaming** — no. Chose accurate leaf-count proportions + a tween over rotation-free-but-approximate slots.
- **Add `d3-hierarchy`** — no. Leaf-weighted wedges need custom angular separation anyway; a tailored `radialLayout()` is simpler and keeps the bundle lean (ADR 0001's ethos).

## Consequences

- A second layout path (radial) lives alongside dagre; both feed the same React Flow canvas and node data.
- Reliability gets a prominent visual channel (the halo) while it is still a soft LLM guess — this motivates **#7** (static credibility list).
- Related follow-ups tracked as issues: **#2** (Answer nodes → a 5th ring), **#3** (withhold-verdict mode), **#4/#5/#6** (mobile minimap/scroll/cleanup), **#8** (colourblind legend + glyphs), **#9** (one-source-at-a-time streaming), **#10** (provider abstraction).
