# Evaluation roadmap: Ev2R evidence scoring + practice-grounded design

Where the eval story should go next, and the research it stands on. Two threads: (1) benchmark the pipeline's **retrieved evidence** — not just its verdicts — with Ev2R-style scorers over FEVER / AVeriTeC / VitaminC; (2) analyse the pipeline against what professional fact-checkers actually do (Graves 2017; Micallef et al. 2022), which both validates the inspectable-graph premise and names the gaps.

All claims below were verified against the vendored/cited PDFs (2026-08-12). Page pointers refer to each paper's PDF.

## 1. What the current harness measures — and doesn't

`evals/` grades **verdict accuracy** on a golden dataset (accuracy, per-class recall, confusion, de-novo vs provenance slices — see `evals/README.md`). It says nothing about whether the _evidence_ the pipeline retrieved was any good. Two failure modes are invisible today:

- **Right verdict, wrong evidence** — the model guesses correctly from priors while retrieval returned junk.
- **Right evidence, different words** — retrieval found a valid alternative evidence path that token metrics (and a gold-label comparison) can't credit.

Evidence quality is the thing VERITRACE actually sells (the inspectable graph), so it needs its own score.

## 2. Ev2R (Akhtar, Schlichtkrull & Vlachos, TACL 2025)

[arXiv:2411.05375](https://arxiv.org/abs/2411.05375) · code: [mubasharaak/fc-evidence-evaluation](https://github.com/mubasharaak/fc-evidence-evaluation) · vendored as `docs/papers/ev2r-2411.05375.pdf`

Ev2R scores retrieved evidence Ê against gold evidence E as a weighted pair:

- **Reference-based component** (§3.1): an LLM decomposes both Ê and E into atomic facts, then checks each side's facts for support in the other — yielding `s_prec` (retrieved facts supported by gold), `s_recall` (gold facts covered by retrieved), and their F1. Prompt template in the paper's Fig. 4 (p. 25).
- **Proxy-reference component** (§3.2): a fine-tuned NLI classifier (DeBERTa-v3) predicts the verdict from (claim, Ê); the score is the softmax probability it assigns to the gold label. Catches "correct-but-different" evidence the reference comparison can't.
- **Combined** (§3.3): `s_Ev2R = 0.5·F1 + 0.5·s_proxy`.

Human-correlation results (278 human-rated AVeriTeC shared-task retrievals, §5): the combined GPT-4o + proxy scorer is the best and most consistent (verdict-agreement ρ = .500 on AVeriTeC); the trained proxy scorer wins on the Wikipedia benchmarks. The scorers are also the most robust under adversarial perturbation (§5.2, Table 5).

### Hungarian METEOR — implement as baseline, trust as nothing

The AVeriTeC score conditions verdict accuracy on evidence matching via **Hu-METEOR**: pairwise METEOR between predicted and gold question–answer pairs, optimal one-to-one assignment by the Hungarian algorithm, with the ≥ 0.25 threshold. The mechanics and threshold come from the **shared-task paper** (Schlichtkrull et al. 2024, [arXiv:2410.23850](https://arxiv.org/abs/2410.23850)), not from Ev2R.

Ev2R's empirical verdict on it is brutal: Hu-METEOR's correlation with human judgment is ~noise (verdict-agreement ρ = .001 VitaminC / −.027 FEVER / −.029 AVeriTeC; coverage ρ = .005, relevance ρ = .008 — worst of all baselines, Tables 2/4), and token metrics generally punish harmless surface changes (METEOR drops 26–32% on semantics-_preserving_ redundancy/noise perturbations, Table 5). So: **report Hu-METEOR for comparability with the AVeriTeC leaderboard; never gate or tune against it.** The headline evidence metric should be Ev2R prec/recall/F1 (+ proxy when we train or reuse one).

## 3. Datasets

| Dataset  | What it is                                                                            | Gold evidence format                                   | Role for us                                                                                     |
| -------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| AVeriTeC | 4,568 real-world claims, previously fact-checked, open-web evidence                   | Question–answer pairs (+ URLs; fixed knowledge store)  | Primary benchmark — our schema already follows it; QA golds slot into per-question Ev2R scoring |
| FEVER    | 185k claims written against Wikipedia                                                 | Annotated Wikipedia sentences, multiple sets per claim | Scale + the classic three-way labels; cheap sanity benchmark                                    |
| VitaminC | ~400k claim–evidence pairs from Wikipedia revisions; contrastive near-identical pairs | Revision sentences (support/refute pairs)              | Stress test: subtle factual deltas — exactly where token metrics fail and classify.ts could too |

### What about MultiFC (Augenstein et al., EMNLP 2019)?

Considered and deliberately parked. MultiFC ([arXiv:1909.03242](https://arxiv.org/abs/1909.03242)) is ~35k real-world claims from 26 fact-checking sites — attractive breadth, but it doesn't fit the evidence-scoring thread: its "evidence" is the top-10 Google snippets the authors retrieved, not annotated gold evidence, so it cannot serve as the reference `E` an Ev2R scorer compares against. As a verdict benchmark it has two further problems for us: each source site has its own label scheme (2–27 classes, needing a lossy mapping to our enum), and the claims are scraped _from fact-check sites_, so live retrieval finds the original fact-check article — exactly what the de-novo mode is supposed to avoid (and the `FACT_CHECKERS` exclusion is currently disabled; see `docs/pipeline-limits.md`). If we want a fourth dataset later, MultiFC works as a stress test of the provenance slice, not the headline eval. (Not in the Zotero library yet, and not vendored.)

Caveat for live-web runs: AVeriTeC systems retrieve from the dataset's knowledge store; VERITRACE retrieves from today's web via Exa. Scores are comparable only qualitatively against the leaderboard — the honest claim is "Ev2R-scored against AVeriTeC golds under live retrieval," not a leaderboard entry. (Same temporal-bounding gap already flagged in `evals/README.md`.)

## 4. Proposed harness changes (incremental)

1. **Adapters** — `evals/golden/` loaders for AVeriTeC-dev, FEVER-dev, VitaminC samples mapping gold evidence into the existing `GoldenClaim` shape plus a new `goldEvidence` field (QA pairs or sentences). Verdict-label mapping: their four-way/three-way ↔ our verdict enum.
2. **Evidence scorer** — `evals/ev2r.mjs`: the reference-based decompose-and-verify scorer as one LLM call per (claim, Ê, E) using the paper's Fig. 4 prompt, emitting `s_prec` / `s_recall` / `s_F1`. Judge model configurable through the existing model registry (a cheap reasoning model — e.g. `gpt-5.6-luna` or `deepseek-v4-flash` — keeps a 500-claim run in cents). Unit-test the aggregation math with a fake judge, same key-free CI pattern as `score.mjs`.
3. **Hu-METEOR baseline** — pairwise METEOR + Hungarian assignment over QA pairs, reported alongside Ev2R for AVeriTeC comparability only.
4. **Proxy component (later)** — reuse the paper's released DeBERTa checkpoint if usable; else skip — the reference-based component alone is the interpretable half and the one that matches our per-question graph.
5. **Report slices** — evidence scores sliced the way the verdict report already is (de-novo vs provenance; and per pipeline config: depth mode on/off, deep search on/off), so retrieval changes show up as evidence-recall deltas, not vibes.

## 5. Practice grounding: Graves 2017 and Micallef et al. 2022

Two studies of what professional fact-checkers actually do — the first ethnographic (PolitiFact, 200+ hours), the second interview-based (21 fact-checkers, 19 countries, CSCW 2022). Both identify essentially the same five-stage anatomy, and both bear directly on VERITRACE's design:

| Professional practice                                                                                     | VERITRACE today                                         | Gap / direction                                                                                              |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Discrete "ruling statement" per check (Graves p. 7)                                                       | Claim extraction → per-claim verdicts                   | Aligned                                                                                                      |
| Checkability filter — opinions can't be checked, line is hard (Graves p. 7; Micallef §5.1.3)              | Relevance triage drops unverifiable claims              | Aligned; keep an explicit abstain path                                                                       |
| "Showing your work": list every source, narrate the steps (Graves p. 11)                                  | The inspectable evidence graph                          | Aligned — this is the product                                                                                |
| Tracing a claim to its origin; provenance IS evidence (Graves pp. 8–9)                                    | Depth mode's link-following walk (ADR 0011)             | Validated by the literature; extend toward origin-dedup — many "confirming" hits can descend from one source |
| Triangulation: opposing-ideology sources, take the overlap (Graves p. 10; Micallef p. 18)                 | Domain-credibility weighting; confirm+refute HyDE split | Partial — no deliberate ideological-diversity sampling or independence weighting                             |
| Absence of elite coverage is itself evidence (Graves p. 9)                                                | Nothing                                                 | Hard to automate; candidate for an explicit "expected-coverage" check                                        |
| Verdict socially produced: editor panel votes; review audits the _process_ (Graves p. 11; Micallef p. 18) | Single-model verdict + gating thresholds                | Frame outputs as **drafts for review**, not rulings; the graph is what a human reviewer audits               |
| Only reader-accessible, archived sources count (Micallef pp. 26–27)                                       | Live URLs on evidence cards                             | Add archival snapshots (link-rot) and avoid paywalled-only evidence                                          |
| AI accepted **only if** it shows "how it checked, what sources, and the reasoning" (Micallef P18, p. 21)  | The whole premise                                       | This is the citation for the product thesis, alongside Warren et al. 2025                                    |

The sharpest challenge from Graves: verdicts emerge from **factual coherence** — goodness-of-fit across individually non-decisive evidence — not from per-question booleans summed up (pp. 14–15). Our relevance-weighted aggregation (ADR 0007) is a reasonable mechanisation, but the doc/UI should stay epistemically modest: graded verdicts, visible reasoning, no pretense of a mechanical test.

## 6. References to add (done alongside this doc)

- Akhtar, Schlichtkrull & Vlachos, _Ev2R: Evaluating Evidence Retrieval in Automated Fact-Checking_, TACL 2025 — vendored PDF + methodology page.
- Graves, _Anatomy of a Fact Check_, Communication, Culture & Critique 2017 (doi:10.1111/cccr.12163) — methodology page (paywalled; not vendored).
- Micallef, Armacost, Memon & Patil, _True or False: Studying the Work Practices of Professional Fact-Checkers_, CSCW 2022 (doi:10.1145/3512974) — methodology page.
