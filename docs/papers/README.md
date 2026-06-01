# Reference papers

The papers VERITRACE's retrieval and decomposition design draws on. PDFs are vendored here so the lineage is auditable offline and the citations in the code/ADRs can be checked against the source.

| File                   | Paper                                                                                                | arXiv                                          | Used for                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| `hyde-2212.10496.pdf`  | Gao, Ma, Lin, Callan — _Precise Zero-Shot Dense Retrieval without Relevance Labels_ (HyDE), ACL 2023 | [2212.10496](https://arxiv.org/abs/2212.10496) | Query expansion via hypothetical documents (`lib/pipeline/expand.ts`) |
| `hero-2410.12377.pdf`  | Yoon, Jung, Yoon, Park — _HerO at AVeriTeC: The Herd of Open LLMs_, FEVER-24 (runner-up)             | [2410.12377](https://arxiv.org/abs/2410.12377) | HyDE-FC retrieval, QA-pair generation, 4-way veracity                 |
| `hero2-2507.11004.pdf` | Team HUMANE — _HerO 2 for Efficient Fact Verification_, AVeriTeC 2.0                                 | [2507.11004](https://arxiv.org/abs/2507.11004) | Efficiency refinements to the HerO pipeline                           |

## What these papers actually do (verified against the PDFs, 2026-05-31)

These notes exist because the codebase previously **mis-attributed** a design to HerO. Read them before citing HerO/HyDE in code or ADRs.

- **HyDE** generates a hypothetical passage from a _single_ open-ended instruction ("write a passage that answers the question"), samples it `N` times, embeds each with a contrastive encoder, and **averages the embedding vectors** (`v_q = 1/(N+1)[Σ f(d_k) + f(q)]`) for dense retrieval over a corpus. It assumes a _uni-modal_ query and explicitly leaves **stance/intent diversity "to future work."** There is no confirm-vs-refute split.
- **HerO** applies HyDE to fact-checking ("HyDE-FC"): its prompt asks for _one_ passage that may "support, refute, indicate not enough evidence, or present conflicting evidence," samples it **N = 8** times (temperature 0.7), and **averages the embeddings**, then retrieves over a **fixed knowledge store shipped with the AVeriTeC dataset — not the live web** (BM25 → SFR-embedding re-rank → top-10).
- **Consequence for VERITRACE:** the two-sided **confirm + refute** hypothetical split in `expand.ts` is **our own design (#13)**, _not_ HerO's — HerO samples one open-ended prompt 8× and averages. Our split is a legitimate small contribution: it fills the exact stance-diversity gap HyDE deferred. And because VERITRACE retrieves from a **live search API (Exa)** — where you pass _text_, not vectors — the embedding-averaging in both papers does not port; we use **Reciprocal Rank Fusion over the hypothetical queries** instead, which is the project's retrieval novelty.
