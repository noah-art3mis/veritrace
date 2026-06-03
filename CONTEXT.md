# VERITRACE

An information-integrity workbench: a human pastes a document, the system decomposes it into checkable units and gathers evidence for each, and renders the result as a traversable evidence graph where the **human makes the final verdict** — not a black-box model. Explainability comes from the evidence trail (the _process_), not from a post-hoc natural-language justification.

## Language

**Source text**:
The raw text a Fact-checker pastes in — a tweet, WhatsApp forward, Facebook caption, or pasted article. The misinformation artifact itself, framing and all. The root node of the graph. (Document-first input, per the SAFE/FacTool/Loki tradition.)
_Avoid_: document (ok informally), input, claim (the Source text is not yet a Claim)

**Claim**:
An **atomic, decontextualized, checkable assertion extracted from the Source text** — the unit whose truth is in question. Extraction must **decontextualize**: inject the date/place/actor from the surrounding Source text so the Claim stands alone and is searchable (e.g. "comandos del CJNG tomaron el aeropuerto" → "Armed CJNG members seized Guadalajara International Airport around 22 Feb 2026"). Balance decontextuality with minimality ("molecular facts"). One Source text yields several Claims.
_Avoid_: statement, fact (overloaded); sub-claim (merged into Claim — see below)

**Sub-claim**:
_Retired._ Earlier drafts split Claim → Sub-claim. With document-first input the extracted unit IS the atomic Claim, so the two collapse. Do not reintroduce a sub-claim layer (it would make the graph 5 deep and illegible).

**Question**:
A specific question the system generates to resolve a Claim ("What were Country X's 2010 emissions?"). The QA-pair (Question → answering Evidence) IS the explanation, per AVeriTeC. Makes the machine's reasoning observable to the Fact-checker.
_Avoid_: query (reserve for the search-API string), prompt

**Evidence**:
A retrieved primary source (or an extracted passage from one) that answers a Question and thereby supports, refutes, or contextualizes a Claim. Carries provenance (who/when), a reliability signal, and a stance.
_Avoid_: source (use for the document, not the retrieved item), result

**Deciding evidence**:
Evidence strong enough to actually move a Claim's Verdict — **high or medium reliability with sufficient stance-confidence**. Low-reliability or low-confidence Evidence is still shown, but can only _contextualize_: it never establishes or flips a Verdict. The minority of Evidence that does the load-bearing work behind a Verdict — and therefore the first thing a Fact-checker should scrutinise.
_Avoid_: strong evidence (vague), relevant evidence, confident

**Verdict**:
The veracity label assigned to a Claim/Sub-claim, from the AVeriTeC 4-way set: **Supported / Refuted / Conflicting-or-Cherry-picked / Not-Enough-Evidence**. Never bare true/false. Carries uncertainty expressed as **source-reliability / evidence-quality**, not a bare confidence %. Advisory only — the Fact-checker decides.
_Avoid_: result, answer, score, true/false

**Evidence graph**:
The traversable, interactive rendering of Source text → Claims → Questions → Evidence with typed edges (supports / refutes / contextualizes, carrying confidence). The graph _is_ the explanation. This is VERITRACE's headline differentiator.
_Avoid_: knowledge graph (broader/different), visualization

**Primary evidence** vs **Answer key**:
Two roles a retrieved link can play. **Primary evidence** is a source the pipeline is _allowed to retrieve and reason over_ (a news-wire report, an official government statement, a registry). The **Answer key** is a finished third-party fact-check (PolitiFact, AFP, Factchequeado) used _only_ to grade a run — it is **never fed to the pipeline**. Feeding a fact-check's conclusion into the graph is "Mode 1 in disguise" — the cheat to avoid.
_Refined (design session):_ a fact-check may now be **retrieved as a waypoint** (to discover the primaries it cites) and shown as a high-trust navigation aid — but its **conclusion is still never fed into a Verdict** (still "Mode 1 in disguise"). The curated grading **Answer key** remains held out and is never given to the pipeline as input. _Watch:_ if retrieval surfaces the very fact-check that also serves as a claim's grading key, the verdict stays de-novo (the conclusion never decides), but note the overlap when grading.
_Avoid_: source (ambiguous), reference

**De novo check**:
Reaching a Verdict from Primary evidence the pipeline gathered itself — never _from_ a third party's finished fact-check. The honesty bar for VERITRACE. **Refined (design session):** fact-check outlets are **no longer excluded from retrieval**. They are allowed in as **waypoints** — a fact-check cites the primaries it relied on, so the pipeline reads it to follow the chain _to_ the origin — and shown as high-trust sources. De-novo is preserved by a role distinction, not exclusion: a fact-check is **never `primary`** and its **conclusion never moves a Verdict** (classify.ts enforces "fact-check ≠ primary"); only the primaries it leads to do.

**Atom of suspicion**:
The unit a verifier module inspects. Three kinds across the full platform vision: a Claim (claim module), a span of text (slop module), a manuscript element (integrity module). The hackathon build inspects only the Claim.

**Human-in-the-loop**:
The system performs the full analysis automatically and makes it **granularly observable** through the Evidence graph; a professional user (the Fact-checker) scrutinizes that trail and exercises final judgment. The system's Verdict is advisory, never authoritative. Control = observability (and, as a stretch, recompute-on-input). Accountability stays human.

**Fact-checker**:
The intended user — a journalist or professional fact-checker who uses VERITRACE to interrogate claims and whose published judgment is the real verdict. Not a general consumer; the UI is a professional workbench, not a consumer toy.
_Avoid_: user, reader, consumer

**Investigation brief**:
A post-run summary panel that auto-opens (left slide-in) when a run resolves: the Source-text Verdict, the support ratio, and an AI-generated narrative summary of the run. An **advisory legibility aid** — it lets the Fact-checker get the gist without panning/zooming the Evidence graph. Explicitly secondary to the graph (which remains _the_ explanation), and it summarizes only what the graph already contains.
_Avoid_: report, verdict (the brief restates the graph's Verdict, it does not author one), explanation (the graph is the explanation)

**Constellation view**:
An **additive, radial overview rendering** of the Evidence graph — every node a colour-coded circle, detail hidden until the Fact-checker interacts — for reading the _shape_ of a large investigation at a glance. A second rendering of the same four layers, **not** a new graph. Secondary to the default card rendering, which remains _the_ explanation: a circle is a way _into_ a node (click opens its card), never a replacement for it. Earns its place only when the card graph gets too big to read.
_Avoid_: replacing the Evidence graph; "the graph" (overloaded — that's the card rendering); network/force graph (the layers are preserved, not dissolved into a blob)

## Relationships

The graph is 4 layers: **Source text → Claims → Questions → Evidence**.

- A **Source text** _yields_ (via extract + decontextualize) one or more **Claims**
- A **Claim** _asks_ one or more **Questions**
- A **Question** is _answered by_ zero or more **Evidence** items
- **Evidence** carries a stance toward its Claim via a typed, confidence-weighted edge (supports / refutes / contextualizes)
- A **Verdict** is _proposed_ by the system per Claim, _aggregated_ to a Source-text-level assessment, and remains advisory to the **Fact-checker**
- The **Evidence graph** renders all four layers and their edges as one traversable, live-building artifact

## Flagged ambiguities

- "Source" was used for both the input document and a retrieved evidence item — resolved: the input is the **document**; a retrieved item is **Evidence**.
- ~~OPEN (#2)~~ **RESOLVED by ADR 0006 (accepted):** an explicit candidate-answer-per-Question would make the card graph 5 deep, in tension with the retired-Sub-claim rule. ADR 0006 resolves it — derive the Answer as a stance-bucket grouping _inside_ the Question (cards) and on the evidence rim (radial), keeping the card graph 4-deep rather than adding a fifth rank.
- ~~OPEN (recursion shape)~~ **RESOLVED:** the pipeline stays a **fixed 4-layer tree** — no mid-run claim/question discovery ("follow the existing questions to their end, and that's it"). The agentic gather loop fills Evidence under existing Questions but never grows the graph, so there is no recursion depth to decide and no 5-deep risk. ADR 0005 records the budget-bounded best-first / re-entrant search it superseded as considered-and-rejected. _Refined (depth mode, ADR 0011):_ the opt-in **depth mode** walks a claim's sources toward the origin by following links, but this is a **gather _strategy_, not a topology change** — every visited page is still Evidence under the same Question; the walk lives as a per-evidence hop index + an ordered trace, never a 5th rank or a recursive tree. The 4-layer invariant holds in both modes.
- ~~OPEN: the human's role.~~ **RESOLVED:** VERITRACE is an _observability workbench_ for professional Fact-checkers. The AI does the analysis; the graph makes it granularly observable; the Fact-checker's professional judgment is final. The model's Verdict is advisory. "Read-only" ≠ "human can't decide" — authority lives in the journalist, not a UI button. Recompute-on-input is a stretch.

## Decisions so far

- **Demo hero**: the claim module, run deep and live. The three-atom platform vision is narrated, not built, for the hackathon. A fake-news-coherent second atom (slop / AI-text signal on the source article) is a possible stretch; academic-integrity is out for this audience.
- **Backend**: DIY — frontier LLM (Anthropic) as reasoner over retrieved evidence + a hosted search API. No forked research pipeline.
- **NLP boundary**: every NLP stage is an HTTP API call (Anthropic for decompose/verify, search API for retrieval, optional hosted detector for slop). No local model, no PyTorch, no GPU in the critical path. Any genuinely-required local model gets quarantined as a Python inference sidecar (Modal/Replicate) behind HTTP — the app stays TS.
- **Stack**: single Next.js (TS) app — API routes stream the pipeline; React Flow renders bespoke claim/evidence card-nodes. Deploy on Vercel. (See ADR 0001.)
- **Licenses**: non-commercial is acceptable for the demo (frees AVeriTeC/CopeNLU datasets and PPS/Retraction Watch as demo material).
- **Interaction**: read-only granular observability is core; the graph **builds live/progressively** as the pipeline streams. Recompute-on-distrust is a stretch.
- **Input model (document-first)**: input is **pasted Source text** (tweet/post/message; an article is just a long blob), not a clean typed claim. The pipeline's first stage **extracts + decontextualizes** atomic Claims from it — the SAFE/FacTool/Loki tradition (vs claim-first FEVER/AVeriTeC, which start from a pre-isolated claim + speaker/date/location metadata). Decontextualization is mandatory: inject date/place/actor from the Source text before retrieval, or Claims are unsearchable. Article-URL fetch is a stretch; the box accepts a raw text blob either way.
- **Graph**: 4 layers — Source text → Claims → Questions → Evidence (AVeriTeC QA-pair = explanation). "Sub-claim" retired (merged into Claim).
- **Verdict taxonomy**: AVeriTeC 4-way; uncertainty shown as source-reliability/evidence-quality, not a bare %.
- **Search/LLM**: Exa for evidence retrieval (content + date + domain in one call); Anthropic for extract/decontextualize/question/verify.
- **Demo input**: curated example **post** chips (rehearsed viral messages, textured outcomes) + live retrieval; free-paste also available.
- **Name/pitch**: VERITRACE — "The AI fact-checker that shows its work. You make the call."
- **Retrieval honesty (de novo, via waypoints not exclusion)**: the pipeline must reach Verdicts from Primary evidence it gathers itself, never from a third-party fact-check's _conclusion_. **Refined (design session):** fact-check outlets are no longer `excludeDomains`-ed; they are allowed in retrieval as **waypoints** to the primaries they cite and shown as high-trust sources, but a fact-check is never `primary` and never moves a Verdict (classify.ts enforces "fact-check ≠ primary"). The curated grading **Answer key** is still held out and never fed to the pipeline. (The `excludeDomains` exclusion was already OFF in code — see docs/pipeline-limits.md — this decision ratifies that, and adds the waypoint framing + high-trust flag.)
- **Transparency principle (no abstracted decisions)**: VERITRACE is a professional workbench whose users handle complexity, so **every decision the pipeline makes is visible to the Fact-checker, not abstracted away** — segmentation, the relevance ranking and what was dropped, the decontextualization, the HyDE anchors, the retrieval queries, the stance/reliability classification, and the verdict rule. A _simplified_ view is welcome as an option, but hiding a decision is not. This sharpens "explainability = the process": the process must be fully inspectable, via progressive disclosure rather than omission. (Implies the "Silent limits catalogue" below should move toward being surfaced, not hidden.)
- **Checkable claim types**: this text-in + web-search build can honestly check **event/existence** and **official-denial** sub-claims de novo. It **cannot** check **media-provenance**, **synthetic-media**, or **origin/rumor-chain** sub-claims (no pixels, no reverse-image/geo/detector tooling) — those correctly return **Not-Enough-Evidence**. NEI here is the uncertainty-first principle working, not a failure.
- **Demo hero claim**: Story 2 (El Mencho / Guadalajara airport) — "died" (Supported via wire) + "airport seized / hostages" (Refuted via official denial), both reachable de novo without any fact-checker.
- **Out of scope for the build**: academic-integrity module (wrong audience). Pixel/provenance handling (image-or-video ingest + a hosted AI-media detector, the slop atom) is a **deferred stretch** — add after the core is solid if time allows; it's the honest path to checking provenance/synthetic-media claims later.
- **Investigation brief (post-run summary)**: a left-side panel auto-opens when a run resolves, showing the Source-text Verdict, the support ratio, and an _AI-generated narrative summary_. This is a deliberate, bounded exception to "explainability = the process, not a post-hoc justification": the summary is an **advisory legibility aid** (so the Fact-checker gets the gist without panning/zooming the graph), explicitly secondary to the Evidence graph, which remains _the_ explanation. It summarizes only the digest already in the graph — it never introduces facts or a Verdict the graph doesn't show.
- **Run legibility caps (configurable)**: the graph grows as Claims × Questions × Evidence, so all three multipliers are user-set caps surfaced in the settings panel (claims, questions per claim, sources per search; each 1–10). Defaults stay low for a legible first run; raising them trades density/cost for thoroughness.
- **Constellation view (radial overview)**: an additive radial rendering of the Evidence graph for big investigations — circles on concentric layer-rings, leaf-weighted wedges, detail on peek/tap, cards still the default. Secondary to the card graph, never a replacement. Full design (geometry, encodings, interaction, streaming, implementation) in **ADR 0003**.
- **Depth mode + spiral view (ADR 0011)**: an **opt-in, off-by-default** alternative to the breadth gather. Instead of fanning out parallel queries under a Question, the agent **follows each source's outbound links toward the originating report** (after dedup), and when a page's links dead-end it searches for the lead the article names (the outlet/agency/author/dateline) and continues. It is the README's "trace to the origin, not the echo" made literal. The walk is a gather _strategy_ only — the graph stays 4 layers; depth is recorded as a per-Evidence hop index and an ordered walk on the Question trace. It renders as a **third view, the "spiral"** — a spiral galaxy: the Source at the core, each Claim rooting its own arm, the Question's Evidence threaded outward along the arm by hop (five claims → five strands trailing off the core) — additive alongside Cards and the Constellation. Gated by `RunConfig.depthMode` + a backend that can follow links (Exa `contents.extras.links`); the verdict rules are unchanged (same classify → cap → verdict tail as breadth).
- **Silent limits catalogue**: many other values bound what gets retrieved, read, and counted toward a Verdict — most hardcoded and invisible from the UI (e.g. only the top 6 Evidence per Question reach the Verdict; the 30/14-day retrieval window; reliability/confidence gates where a low-reliability source can only contextualize, never decide). All of them, alongside the configurable settings, are catalogued in `docs/pipeline-limits.md`. Note: the de-novo `excludeDomains` exclusion described above is currently **OFF** in code — see that doc for the actual current values. Per the **transparency principle** above, these "silent" limits should progressively be surfaced in the UI rather than left hidden.
