// The golden-example schema for VERITRACE evals: one decided, human-adjudicated claim
// per record, with the gold verdict the pipeline is graded against. The shape is a
// deliberate superset of AVeriTeC (claim → questions → evidence → justification) so that
// AVeriTeC's public dev set and our harvested Snopes/Full Fact/Aos Fatos claims live in
// one format. See ./README.md for the benchmark/licensing rationale and ./convert.mjs for
// the AVeriTeC + X-Fact importers that emit this shape.

import type { Verdict } from "@/lib/graph-types";

/** Source fact-checking organisation. Free string is allowed (AVeriTeC spans ~50 orgs); the
 *  named members are the ones we filter on most (the three the harvest targets, + PolitiFact). */
export type FactCheckOrg = "snopes" | "fullfact" | "aosfatos" | "politifact" | "other";

/** Which academic corpus (or manual curation) a record was bootstrapped from. */
export type GoldenBenchmark = "averitec" | "x-fact" | "manual";

/**
 * Dataset partition. `eval` is the held-out scoring set; `dev` is for prompt/threshold
 * tuning; `smoke` is the tiny always-run subset for CI. Kept separate from the benchmark's
 * own split so we can re-partition without re-harvesting.
 */
export type GoldenSplit = "eval" | "dev" | "smoke";

/** A verification question with the primary-source URLs a human used to answer it.
 *  Mirrors a QuestionItem + its answering EvidenceItem(s) — lets an eval grade the
 *  question-generation and retrieval stages, not just the final verdict. */
export interface GoldenQuestion {
  question: string;
  /** Primary/authoritative URLs that answer the question (the human's evidence trail). */
  keyEvidenceUrls: string[];
}

/** Where the claim and its adjudication came from — the audit trail for the gold label. */
export interface GoldenSource {
  /** Publishing fact-checker. Derived from the fact-check article's host where not explicit. */
  org: FactCheckOrg | string;
  /** The fact-check article URL (the human adjudication we trust). */
  url: string;
  /** The org's own rating verbatim, BEFORE normalisation to our 4-way enum ("False",
   *  "Mixture", "Distorcido", …). Kept so the lossy mapping stays auditable/re-mappable. */
  originalRating: string;
  /** ISO 639-1 language of the claim ("en", "pt", …). */
  language: string;
  /** The corpus this record was bootstrapped from. */
  benchmark: GoldenBenchmark;
}

/** The graded annotations — what a pipeline run is scored against. */
export interface GoldenGold {
  /** The expected final verdict (our enum). The primary scoring target. */
  verdict: Verdict;
  /** One-paragraph human justification for the verdict (advisory; useful for error analysis). */
  justification?: string;
  /** Optional gold decomposition — grade claim segmentation/decontextualisation (maps to ClaimItem). */
  subClaims?: { text: string; verdict: Verdict }[];
  /** Optional gold questions + evidence — grade question generation and retrieval. */
  questions?: GoldenQuestion[];
  /** The primary-source URLs underpinning the verdict (union of per-question evidence). */
  keyEvidenceUrls: string[];
}

/**
 * One golden example. The top level is the pipeline INPUT (claim + date — exactly what a
 * user pastes); `gold` is what we grade against; `source`/`license`/`split`/`tags` are
 * provenance. JSONL on disk (one record per line) — diff-friendly and append-only.
 */
export interface GoldenClaim {
  /** Stable id, e.g. "averitec-dev-0142" or "xfact-pt-aosfatos-0007". */
  id: string;
  /** Decontextualised claim text (the assertion under test). */
  claim: string;
  /** ISO YYYY-MM-DD the claim was made — bounds the retrieval window (see ClaimItem.date). */
  claimDate?: string;
  /** Who made the claim, where known. */
  speaker?: string;
  gold: GoldenGold;
  source: GoldenSource;
  /** SPDX-ish license tag of the source corpus ("CC-BY-NC-4.0", "MIT", …). */
  license: string;
  split: GoldenSplit;
  /** Free tags for stratified scoring. IMPORTANT: tag `de-novo-checkable` vs
   *  `provenance` — VERITRACE checks claims de novo and unfairly scores 0 on image/quote
   *  provenance items, so those must be stratified out (see README). */
  tags: string[];
}
