<img src="./project-logo.png" alt="VERITRACE" width="120" align="right" />

# VERITRACE

[Access here](https://veritrace-chi.vercel.app/)

**The AI fact-checker that shows its work.**

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

## How it's built

Each stage is a recognized fact-checking / retrieval technique, not an ad-hoc prompt:

- **SAFE-style two-pass decompose.** Segment the source into _every_ atomic utterance (presuppositions included), then triage: decontextualize each + relevance-filter to the load-bearing claims. Trivial background is greyed as "dropped," not checked.
- **HyDE query expansion.** Before searching, the model writes a short _neutral_ hypothetical primary-source passage and appends it to the query, so retrieval matches the shape of ideal evidence.
- **Agentic gather loop.** Retrieval is a model-driven, multi-query search loop that keeps varying its angle until it has at least two reliable sources including one primary — with a hard cap as the backstop.
- **Deterministic, inspectable verdict.** The evidence→verdict mapping is a _stated_ rule, not a learned black box: stance must be read clearly enough, and only high/medium-reliability sources can _move_ a verdict — a blog can only contextualize.

## Built for messy, adversarial input

Real viral text is misspelled, duplicated, and slanted. VERITRACE hardens every stage against it:

- **Typo & entity repair.** The decomposer reads for intent and fixes mangled named entities before extracting.
- **Honest provenance.** Ensures a finished third-party fact-check is never counted as a _primary source_.
- **Scope-faithful claims.** Decomposition preserves the source's quantifier and the classifier won't let one individual's action "support" a claim about a group.
- **De-duplicated claims.** Restatements of the same proposition collapse to one checked claim.
- **Date-anchored retrieval.** The event date is inferred from the text, keeping years-old reporting from polluting a fresh claim.
- **Legible evidence nodes.** Each question keeps only its most decision-relevant sources, so a node stays readable instead of sprawling to dozens of cards.

## Methodology

For more details see the [**Methodology & References** page](https://veritrace-chi.vercel.app/methodology).
