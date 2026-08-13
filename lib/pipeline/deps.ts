import type { ReasoningProvider } from "../reasoner-types";
import type { RawEvidence, FetchedSource, SearchOptions } from "../exa";
import type { FactCheckHit } from "../factcheck";
import type { Reranker } from "./rerank";

/**
 * Depth-mode dependencies (present only when RunConfig.depthMode is on AND the search backend can
 * follow links). `fetchSource` visits one page by URL and returns its text + outbound links; the
 * caps bound the walk. ABSENT ⇒ the default breadth gather (resolve.ts branches on it).
 */
export interface DepthDeps {
  /** Visit one page by URL: its text/excerpt (as evidence) plus its outbound links (next frontier). */
  fetchSource: (url: string, opts?: SearchOptions) => Promise<FetchedSource>;
  /** Max links the walk may follow before it stops and judges what it holds (MAX_DEPTH_HOPS). */
  maxHops: number;
}

// The per-request dependencies threaded through the pipeline: a model caller and an
// evidence search, both already bound to this run's config + API keys (see createReasoner
// / createExaSearch). Stages take these explicitly rather than reaching for module globals,
// so each request runs with its own model, temperature, thinking setting, and keys.
export interface PipelineDeps {
  ask: ReasoningProvider;
  search: (query: string, opts?: SearchOptions) => Promise<RawEvidence[]>;
  /** Legibility cap on extracted claims for this run (from RunConfig.maxClaims). */
  maxClaims: number;
  /** Legibility cap on resolving questions per claim (from RunConfig.maxQuestions). */
  maxQuestions: number;
  /**
   * Optional reference "as-of" date (ISO YYYY-MM-DD) — the date the source was written /
   * the claim was made. When set, triage anchors date inference to it instead of the wall
   * clock and backfills it onto any claim whose own date the model can't infer, so retrieval
   * is windowed to the claim's era rather than today. The app leaves this unset (a pasted
   * claim is "as of now"); evals set it to the gold's claimDate to prevent temporal leakage.
   */
  asOf?: string;
  /**
   * Optional fact-check short-circuit. Present only when RunConfig.factCheckShortCircuit is
   * on (and a key is available); ABSENT is the off switch — the pipeline then runs fully de
   * novo. Given a claim, returns any existing fact-checks of it (empty = none / lookup failed).
   */
  factCheck?: (query: string) => Promise<FactCheckHit[]>;
  /**
   * Optional embedding re-rank (#57, ADR 0010). Present only when RunConfig.rerank is on AND a
   * Cohere key resolved; ABSENT keeps the no-embeddings de-novo path. When present, resolveQuestion
   * re-ranks the gathered candidates by cosine to the directional hypotheticals before classify.
   */
  rerank?: Reranker;
  /**
   * Optional depth mode (#depth). Present only when RunConfig.depthMode is on and the backend can
   * follow links; ABSENT keeps the breadth gather. When present, resolveQuestion walks each claim
   * toward its origin (follow links / chase the named lead) instead of fanning out parallel queries.
   */
  depth?: DepthDeps;
}
