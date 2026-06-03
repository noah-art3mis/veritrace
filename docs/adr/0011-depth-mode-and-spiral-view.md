# Depth mode (link-following gather) and the spiral view

**Status:** accepted

## Context

The default gather loop is **breadth-first** (resolve.ts): under each question it fans out several parallel queries (HyDE confirm/refute + RRF + model follow-ups), dedups by URL, and keeps the most decision-relevant handful. That maximises coverage but it has a known weakness the README already names — "trace to the origin, not the echo": a fan-out routinely fills up with re-reporting that all parrots the same viral claim, and never walks back to the **originating** source the re-reports cite.

The ask: a **depth** alternative. Instead of widening the net, follow each source's outbound links toward the origin — and when a page's links dead-end, use the lead the article names (the outlet it credits, the agency it quotes, the author, the dateline) to search for that originating source and continue. Render the result as a **spiral**, because a depth walk is a chain (echo → … → origin), which reads naturally as an outward coil rather than a fan.

The tension to respect: ADR 0005 / CONTEXT.md fixed the graph at **4 layers with no mid-run discovery**. A link-walk must not smuggle in a 5th rank or a recursive tree.

## Decision

Add an **opt-in, off-by-default** depth mode, gated by `RunConfig.depthMode` **and** a search backend that can follow links (`SearchProvider.capabilities.followLinks`).

- **Retrieval seam (`lib/exa.ts`, `lib/search.ts`):** a new `createExaFetch` "visit one page by URL" closure — the depth counterpart to `createExaSearch`. It returns the page as a normal `RawEvidence` (so the **same** classifier reads it) plus the page's outbound links (Exa `contents.extras.links`) as the next hop's frontier. Exposed as `SearchProvider.fetchSource`, present only on backends with `followLinks`.
- **Depth gather (`lib/pipeline/depth.ts`):** `gatherDepth` seeds with one search, then drives a model loop with two tools — `follow_link` (go deeper) and `search_evidence` (jump to a named lead when links dead-end). Every URL is **deduped** (`normalizeUrl`) so a page is never re-read or looped; `dedupLinks` filters each page's frontier (drops visited, duplicate, asset, and anchor links). Only **visited** pages become evidence; search results are merely the candidates the model picks its next hop from. A backstop auto-visits the top seed result if the model never follows anything, so a question always yields ≥1 source. Bounded by `MAX_DEPTH_HOPS` (run-config).
- **Same verdict tail:** `resolveQuestion` branches on `deps.depth` but then runs the **identical** echo-filter → (optional rerank) → classify → cap → verdict path, so depth changes _which_ sources are gathered, never the verdict rule. Each source's hop index is re-attached as `EvidenceItem.depth` by URL, and the ordered chain rides the question trace as `QuestionTrace.walk` (surfaced in the card — transparency principle).
- **Spiral view (`lib/spiral-layout.ts`, `use-spiral-flow.ts`):** a **third** rendering of the same 4-layer graph, alongside Cards and Radial — a **spiral galaxy**. The Source is the galactic core; each Claim roots its own spiral **arm** radiating from the core; each Question forks the arm; and the Question's Evidence threads **outward along the arm by hop** (hop 0 nearest the core, the origin furthest out), twisting a fixed amount per hop so all arms curl the same way (a pinwheel, not straight spokes). Five claims → five arms — a central bulge with long strands trailing off it. Arm length encodes how far that claim was walked toward its origin (depth-as-distance). It reuses the radial circle nodes, edges, and force layer; only the anchor geometry (galaxy arms vs concentric rings) differs. A run in depth mode opens on the spiral by default; the segmented Cards/Radial/Spiral control switches freely.

**The graph stays 4 layers.** Depth lives entirely in the retrieval _process_ — a hop index per evidence item and an ordered walk on the trace — not in the topology. No 5th rank, no recursion; ADR 0005's invariant holds.

## Considered options

- **Make depth the default gather** — rejected: link-following is slower (a fetch per hop) and narrower (one chain vs a fan), so it's the specialist tool for "walk this back to the origin", not the everyday path. Off-by-default, like the fact-check short-circuit and the embedding re-rank.
- **Add evidence-of-evidence as a 5th graph layer (a real chain in the topology)** — rejected: it breaks the 4-layer invariant (ADR 0005) and makes the card graph illegible. The chain is recorded as ordering + trace instead, and the spiral _renders_ that ordering without adding a rank.
- **Replace the Radial/Constellation view with the spiral** — rejected: the constellation reads breadth (a fan-out's shape) well; the spiral reads depth (a walk) well. They answer different questions, so the spiral is additive.
- **One single coil for the whole graph (every node on one winding line)** — the first cut, replaced: it merged all claims onto one snail-shell and lost the "each claim is a strand" reading. The **per-claim arm** (galaxy) form makes each claim's origin-walk its own arm, which both maps onto the retrieval (one walk per claim/question) and reads as the intended Milky Way.

## Consequences

- New optional config (`depthMode`) and optional `deps.depth`; the route builds it only when the flag is on **and** the backend can follow links (else absent — off, no error).
- A new retrieval capability (`fetchSource` / `followLinks`) on the provider seam; today only Exa implements it. A backend without it simply can't offer depth mode.
- **Cannot be tuned end-to-end without live Exa link data**, so unit tests cover the pure helpers (`normalizeUrl`, `dedupLinks`), the walk bookkeeping (`gatherDepth` with mocked tools), the fetch mapping (mocked Exa `getContents`), and the spiral geometry. Live tuning (hop budget, link-ranking prompt) is follow-up.
- Adds a cost/latency tradeoff users opt into explicitly; the default breadth path is unchanged.
