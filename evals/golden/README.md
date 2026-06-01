# Golden examples for VERITRACE evals

Decided, human-adjudicated claims with a gold verdict, used to score the pipeline. We do
**not** scrape Snopes / Full Fact / Aos Fatos directly — their ToS discourage it, the HTML
is brittle, and (per their multi-point rating scales) the raw labels don't map cleanly onto
our four verdicts anyway. Instead we **bootstrap from openly-licensed academic corpora that
already contain these orgs' fact-checks**, then normalise into one schema.

## The schema

One [`GoldenClaim`](./schema.ts) per line of JSONL. Three concerns kept separate:

- **input** — `claim` + `claimDate`: exactly what a user pastes; what the pipeline sees.
- **`gold`** — what we grade against: `verdict` (primary target) plus optional `subClaims`,
  `questions[].keyEvidenceUrls`, and `justification` to grade the intermediate stages our
  evidence graph exposes (decomposition, question generation, retrieval) — not just the
  final label.
- **provenance** — `source` (org, article URL, `originalRating` verbatim, language,
  benchmark), `license`, `split`, `tags`.

```jsonc
{
  "id": "averitec-dev-00142",
  "claim": "The unemployment rate fell to 3% in 2022.",
  "claimDate": "2022-05-25",
  "speaker": "A politician",
  "gold": {
    "verdict": "refuted",
    "justification": "Official BLS figures put the rate at 3.6%.",
    "questions": [
      { "question": "What was the 2022 unemployment rate?", "keyEvidenceUrls": ["https://bls.gov/data"] }
    ],
    "keyEvidenceUrls": ["https://bls.gov/data"]
  },
  "source": {
    "org": "snopes",
    "url": "https://www.snopes.com/fact-check/unemployment/",
    "originalRating": "Refuted",
    "language": "en",
    "benchmark": "averitec"
  },
  "license": "CC-BY-NC-4.0",
  "split": "eval",
  "tags": ["numerical-claim", "de-novo-checkable"]
}
```

The verdict enum (`supported` / `refuted` / `conflicting` / `nei`) is reused from
[`lib/graph-types.ts`](../../lib/graph-types.ts) — the same four AVeriTeC labels we already
adopted, so AVeriTeC imports are a 1:1 label map.

## Source benchmarks

| Benchmark | Covers | Labels | License | Role here |
|---|---|---|---|---|
| **[AVeriTeC](https://fever.ai/dataset/averitec.html)** (NeurIPS'23) | 4,568 real claims, ~50 orgs **incl. Snopes & Full Fact** | Supported / Refuted / Conflicting-Cherrypicking / Not-Enough-Evidence — **identical to ours** | CC-BY-NC-4.0 | **Primary.** English Snopes/Full Fact golds; claim→Q/A→evidence structure mirrors our graph; built to avoid temporal leakage. |
| **[X-Fact](https://github.com/utahnlp/x-fact)** (ACL'21) | 25 languages incl. **Portuguese** | 7-way veracity | MIT | Route to **Aos Fatos / pt-BR** in a citable form. |
| [LIAR / LIAR-PLUS](https://aclanthology.org/P17-2067/) | 12.8k PolitiFact | 6-way | research use | Scale; metadata-rich; no evidence trail. |
| [MultiFC](https://arxiv.org/abs/1909.03242) | 36k from 26 sites incl. Snopes | per-site | research use | Largest real-world multi-domain; noisy labels. |
| [FEVER](https://fever.ai/) / [FEVEROUS](https://fever.ai/dataset/feverous.html) / [VitaminC](https://github.com/TalSchuster/VitaminC) | Wikipedia-derived | S / R / NEI | varies | Synthetic claims — good for retrieval/NLI, weak for real-world checkworthiness. |
| [CLEF CheckThat!](https://checkthat.gitlab.io/) | check-worthiness | binary | research use | For grading our `checkworthy` triage stage specifically. |

Why AVeriTeC is the anchor: we already borrowed its four-way verdict, so its public dev set
drops straight into this format and gives us a **free external benchmark** to track against.

## How to build a golden set

The corpora aren't redistributed in this repo (license + size). Download them yourself, then
convert. [`convert.mjs`](./convert.mjs) is dependency-free — plain `node`, no install:

```bash
# 1. Download (accept each corpus's license first):
#    AVeriTeC → https://fever.ai/dataset/averitec.html   (dev split is labelled; test is not)
#    X-Fact   → https://github.com/utahnlp/x-fact         (data/*.tsv)
mkdir -p evals/golden/raw

# 2. Snopes + Full Fact golds from AVeriTeC (filter by article host):
node evals/golden/convert.mjs averitec evals/golden/raw/averitec_dev.json --split dev \
  --site snopes.com  --out evals/golden/snopes.jsonl
node evals/golden/convert.mjs averitec evals/golden/raw/averitec_dev.json --split dev \
  --site fullfact.org --out evals/golden/fullfact.jsonl

# 3. Aos Fatos golds from X-Fact (Portuguese):
node evals/golden/convert.mjs xfact evals/golden/raw/x-fact/dev.tsv --lang pt \
  --site aosfatos --out evals/golden/aosfatos.jsonl

# (drop --site on the AVeriTeC commands to take all ~50 orgs)
```

Counts are reported on stderr. Generated `*.jsonl` is git-ignored except `smoke.jsonl` — keep
a small hand-checked subset under version control for CI; regenerate the rest on demand.

## Two things to get right before trusting the numbers

1. **Verdict normalisation is lossy — keep it auditable.** Each org uses its own scale
   (Snopes: True…Mixture…False/Unproven/Miscaptioned; Aos Fatos: Verdadeiro/Falso/Distorcido/
   Insustentável; Full Fact: free text). AVeriTeC already did this normalisation for us;
   X-Fact's 7-way map lives in `XFACT_LABELS` in `convert.mjs`. We always store the org's raw
   label in `source.originalRating` so the mapping can be revisited. Spot-check it.

2. **Stratify de-novo-checkable vs provenance claims.** VERITRACE checks claims *de novo* and
   will score ~0 on image/quote-provenance items ("did X really say Y", "is this photo real")
   — that's a category mismatch, not a pipeline failure. Tag those `provenance` and report
   accuracy on the `de-novo-checkable` slice separately, the same split the demo corpus draws
   (see [`demo-corpus/SOURCES.md`](../../demo-corpus/SOURCES.md)).

## Layout

```
evals/golden/
  schema.ts        GoldenClaim type (the contract); reuses Verdict from lib/graph-types
  convert.mjs      AVeriTeC + X-Fact → GoldenClaim importers + CLI (dependency-free)
  convert.test.ts  label-mapping / evidence-flattening tests (npm test)
  smoke.jsonl      tiny hand-checked CI subset (the only generated file we commit)
  raw/             downloaded corpora (git-ignored)
```
