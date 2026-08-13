<img src="./project-logo.png" alt="VERITRACE" width="120" align="right" />

# VERITRACE

[Access here](https://veritrace-chi.vercel.app/)

**Observable AI fact checker.**

VERITRACE is an observability workbench for fact-checking. Paste a claim and an AI decomposes it into atomic sub-claims, writes the exact questions needed to resolve each, and retrieves live **primary sources** to answer them — laying the entire reasoning trail bare as a traversable evidence graph that builds itself in real time. Verdicts are advisory only: every step traces to a source you can open, so the journalist — not the model — makes the final call.

Built by Gustavo Araujo Costa ([@noah-art3mis](https://github.com/noah-art3mis)) for Platanus Build Night — Ciudad de México.

## What makes it different

- **Process-based explainability.** The explanation _is_ the evidence trail, not a paragraph the model invents after the fact. Zero-shot LLM fact-check rationales are routinely unfaithful — convincing but disconnected from the real reasoning — so VERITRACE never asks you to trust a verdict you can't trace. Interviews with professional fact-checkers found they want exactly this: transparency and replicability into _how_ a system reached its conclusion, not just a label ([Warren, G., Shklovski, I., & Augenstein, I., Show Me the Work: Fact-Checkers' Requirements for Explainable Automated Fact-Checking. 2025](https://doi.org/10.1145/3706598.3713277)).
- **Nuanced verdicts.** AVeriTeC's 4-way labels — **Supported / Refuted / Conflicting / Not-Enough-Evidence** — never bare true/false. When it can't verify a claim it returns Not-Enough-Evidence instead of guessing; that honesty is the point.
- **Human-in-the-loop.** The model does the analysis and makes it granularly observable; the fact-checker exercises final judgment. Accountability stays human.

## How it works

The pipeline streams a four-layer **evidence graph**, live, as it runs:

```
Source text  →  Claims  →  Questions  →  Evidence  →  Verdict
```

1. **Decompose** — extract atomic, decontextualized claims from the pasted text (date / place / actor injected so each claim stands alone and is searchable).
2. **Question** — generate the specific questions a fact-checker would ask to resolve each claim.
3. **Retrieve** — fan out live searches for primary sources via Exa, scoring each source's reliability.
4. **Verdict** — propose an advisory label per claim, then aggregate to a source-level assessment.

Each card flies into the graph the moment its stage completes; a claim's verdict resolves as soon as its last question answers.

## Innovations

Every stage is a recognized fact-checking / retrieval technique made inspectable — not an ad-hoc prompt. The work below is grounded in the literature (see the [Methodology page](https://veritrace-chi.vercel.app/methodology)) and tracked issue-by-issue; numbers point at the issues/PRs that shipped each piece.

### Retrieval

- **Stance-shaped HyDE.** Before searching, the model writes hypothetical primary-source passages and appends them to the query so retrieval matches the _shape_ of ideal evidence. VERITRACE's twist on classic HyDE is a **2-way confirm/refute split** — a passage that would _support_ the claim and one that would _refute_ it — searched in both directions instead of one neutral passage, so a true claim and its denial are both surfaced (#13, #46, #61). Fusing the two rankings via Reciprocal Rank Fusion is the planned next step (#56).
- **Agentic gather loop.** Retrieval is a model-driven, multi-query search loop that keeps varying its angle until it holds at least two reliable sources including one primary — with a hard cap as the backstop, never a black-box single shot.
- **Trace to the origin, not the echo.** An agent walks every claim back to its originating source — a news wire, an official statement, a registry — rather than stopping at re-reporting that parrots the viral claim. A finished third-party fact-check is treated as a _waypoint_ to the primaries it cites, never as the answer to copy: it is never counted as a primary source and its conclusion never moves a verdict (#51, #72).
- **Depth mode (link-following gather).** An opt-in alternative to the breadth fan-out: instead of widening the net, the agent visits one source, reads it, and **follows the single most origin-likely outbound link** — repeating, dedup at every hop, to walk the citation chain back to the primary source. When a page's links dead-end it searches for the lead the article names (the outlet, agency, author, or dateline it credits) and continues. The graph stays 4 layers — depth lives in the retrieval _process_ (a hop index per source + an observable walk on the trace), not in the topology — and the verdict rules are identical to the breadth path (ADR 0011).
- **Domain-credibility list.** Source reliability comes from a curated static domain list, not an LLM guess (#7, #43).
- **Date-anchored retrieval.** The event date is inferred from the text, keeping years-old reporting from polluting a fresh claim.
- **Budget-bounded claim selection.** Checking is a relevance-ordered, fixed-depth search over the top-scoring claims, not a full-width expansion that explodes with the input (#11, #60; ADR 0005).
- **Google Fact Check Tools** integration as an optional waypoint/short-circuit (#19).

### Decomposition & triage

- **SAFE-style two-pass decompose.** Segment the source into _every_ atomic utterance (presuppositions included), then triage: decontextualize each (inject date/place/actor) and relevance-filter to the load-bearing claims. Trivial background and entailed premises are greyed as "dropped," not checked (#52, #73).
- **Mechanical claim-echo filter.** Circular "evidence" that merely restates the claim is dropped before classification, so a viral message can't corroborate itself (#14, #41).
- **Typo & entity repair.** The decomposer reads for intent and fixes mangled named entities before extracting.
- **Scope-faithful, de-duplicated claims.** Decomposition preserves the source's quantifier (one individual's action can't "support" a claim about a group), and restatements of the same proposition collapse to one checked claim.

### Verdict honesty

- **Deterministic, inspectable verdict.** The evidence→verdict mapping is a _stated_ rule, not a learned black box: stance must be read clearly enough, and only high/medium-reliability sources can _move_ a verdict — a blog can only contextualize.
- **Conflicting ≠ Not-Enough-Evidence.** The aggregation distinguishes genuinely conflicting/cherry-picked evidence from simply inconclusive evidence, relevance-weighted so a single decomposed sub-claim can't dominate the document verdict (#53, #74; ADR 0007).
- **Echo-chamber guard.** A verdict abstains to Not-Enough-Evidence when no _deciding_ source is primary (#51, #72).
- **Withhold-verdict mode.** A settings toggle hides the model's label entirely so the fact-checker reaches their own conclusion from the trail (#3, #39).

### Explainability & UX

- **The graph is the explanation.** It builds live, streaming one source at a time rather than dumping per-question blocks (#9, #45).
- **Constellation view.** An additive radial overview for reading the _shape_ of a large investigation at a glance, with zoom-aware edge labels (#47, #82), spring-eased settle motion (#49), and the real card reused on open (#48, #86) — secondary to the cards, never a replacement (ADR 0003).
- **Spiral view.** A third rendering, the companion to depth mode: a **spiral galaxy** — the source at the core, each claim rooting its own spiral arm, evidence threaded outward along the arm by walk-hop so a claim traced echo → origin reads as a strand trailing off the core (depth-as-distance). Additive alongside Cards and the Constellation; a depth run opens on it by default (ADR 0011).
- **Verdict-driven cards.** Consistent card anatomy with verdict colour propagated along the connectors (#23, #24, #26, #79, #80), reading-order orientation, and clean edge routing (#25, #81).
- **Colourblind-safe encoding.** A colour↔meaning legend plus redundant non-colour glyph cues (#8, #44).
- **Re-include a dropped claim.** The fact-checker can manually un-drop a relevance-filtered claim back into the graph (#33, #83).
- **Transparency principle.** Every decision the pipeline makes — segmentation, the relevance ranking and what it dropped, decontextualization, the HyDE anchors, the queries, stance/reliability classification, the verdict rule — is surfaced rather than abstracted away.
- **Mobile-first viewport.** Scrollable settings, auto-hidden minimap, and a collapsing input reclaim the first screen on small viewports (#4, #5, #6, #27).

### Engineering & reliability

- **One gateway, any model.** Every reasoning call goes through a single OpenAI-compatible gateway (OpenRouter by default), so Anthropic, OpenAI, Gemini, DeepSeek, GLM, or Kimi models — and any custom slug, day-one — run with one key and no code changes; the picker shows per-model cost (#10, #62, #67; ADR 0012).
- **Self-repairing JSON.** `askJSON` validates against a schema and does one bounded re-ask on malformed output — essential for cheaper, flakier models (#66).
- **Resilient runs.** A single flaky model parse or an Exa timeout degrades one node instead of crashing the whole run (#70, #71).
- **Rate-limit hardening.** A concurrency limiter, a per-IP rate limit, and friendly provider-error mapping tame free-tier 429s (#68, #69).
- **Honest eval harness.** Gold claims are bootstrapped from openly-licensed academic benchmarks (AVeriTeC, X-Fact) rather than scraped from the fact-checkers, then scored against the live pipeline (#16, #55; ADR 0002).
- **Thin all-API backend.** A single Next.js/TypeScript app where every NLP stage is an HTTP call — no local model, no GPU in the critical path (ADR 0001).

## Methodology

For the research grounding and full reference list see the [**Methodology & References** page](https://veritrace-chi.vercel.app/methodology).
