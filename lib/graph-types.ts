// The VERITRACE 4-layer evidence-graph schema: Source text → Claims → Questions → Evidence.
// This is the contract the pipeline (P1) emits and the renderer (P2/P3) consumes.

export type Verdict = "supported" | "refuted" | "conflicting" | "nei";
export type Stance = "supports" | "refutes" | "contextualizes";
export type Reliability = "high" | "medium" | "low";
export type SourceType = "primary" | "secondary" | "opinion";
export type QuestionStatus = "pending" | "searching" | "answered";

/** A retrieved primary source answering a Question; carries provenance + stance. */
export interface EvidenceItem {
  id: string;
  questionId: string;
  title: string;
  url: string;
  domain: string;
  faviconUrl?: string;
  publishedDate?: string; // ISO
  passage: string; // the answering excerpt (Exa highlight)
  stance: Stance;
  reliability: Reliability;
  sourceType: SourceType;
  stanceConfidence?: number; // 0..1
}

/**
 * The retrieval internals behind one resolved question — normally hidden, surfaced only
 * when the user enables "show pipeline internals". The HyDE seed, the agent's actual
 * queries, and its closing summary are the steps the evidence cards don't show on their own.
 */
export interface QuestionTrace {
  hydePassage: string; // the neutral hypothetical answer that seeds retrieval (HyDE)
  searchQueries: string[]; // every query the gather agent issued, in order
  gatherSummary: string; // the agent's one-line "what I found" at the end of the loop
}

/** A question the system generates to resolve a Claim (QA-pair = explanation). */
export interface QuestionItem {
  id: string;
  claimId: string;
  text: string;
  status: QuestionStatus;
  /** Retrieval internals, attached once the gather loop resolves (see QuestionTrace). */
  trace?: QuestionTrace;
}

/** An atomic, decontextualized checkable assertion extracted from the Source text. */
export interface ClaimItem {
  id: string;
  text: string; // decontextualized (date/place/actor injected)
  original?: string; // raw fragment as it appeared in the source text
  verdict: Verdict | null; // null until resolved
  rationale?: string; // one-line why, advisory
  /** false = provenance/synthetic/origin type this text build can't check → NEI by design. */
  checkable: boolean;
  /** false = subjective/opinion/prediction, not a verifiable factual assertion → NEI, no search. Absent = check-worthy. */
  checkworthy?: boolean;
  /**
   * SAFE's relevance axis (separate from check-worthiness): false = a trivial/uncontested
   * presupposition or entailment the segmenter surfaced ("Springfield is a city") that is
   * NOT the load-bearing assertion a fact-check exists to verify. Relevance-dropped claims
   * are shown (so the full decomposition is legible) but never searched and not tallied.
   * Absent = relevant (the default), so existing claims need no migration.
   */
  relevant?: boolean;
  /**
   * The triage relevance score (0..1) — how load-bearing/contested the claim is. Drives
   * which claims are searched: `capSearchable` keeps the top `maxClaims` by this score and
   * derives `relevant` from the result (ADR 0005). Shown for display/ordering; absent on
   * non-triaged claims (treated as fully relevant).
   */
  relevanceScore?: number;
  /** Event date (ISO YYYY-MM-DD) parsed from the source — bounds the retrieval window. */
  date?: string;
  /** Proper nouns / numbers the decontextualizer injected that are absent from the source (over-specification audit). */
  injected?: string[];
}

/** Per-verdict claim counts under a source — the graded "X of N supported" signal (SAFE F1@K). */
export interface ClaimTally {
  supported: number;
  refuted: number;
  conflicting: number;
  nei: number;
  total: number; // checked claims only (the "of N" in "X of N supported")
  dropped?: number; // relevance-dropped claims — segmented out, shown but not checked
}

/** The raw pasted blob (tweet / post / message / article). Root of the graph. */
export interface SourceTextItem {
  id: string;
  text: string;
  verdict: Verdict | null; // aggregated, advisory
  tally?: ClaimTally; // per-verdict claim counts (the support ratio)
}

/** The whole graph, flat by layer; edges are implied by the *Id back-references. */
export interface FactGraph {
  source: SourceTextItem;
  claims: ClaimItem[];
  questions: QuestionItem[];
  evidence: EvidenceItem[];
}
