import type { AnthropicCaller } from "../anthropic";
import type { RawEvidence, SearchOptions } from "../exa";
import type { FactCheckHit } from "../factcheck";

// The per-request dependencies threaded through the pipeline: a model caller and an
// evidence search, both already bound to this run's config + API keys (see createAnthropic
// / createExaSearch). Stages take these explicitly rather than reaching for module globals,
// so each request runs with its own model, temperature, thinking setting, and keys.
export interface PipelineDeps {
  ask: AnthropicCaller;
  search: (query: string, opts?: SearchOptions) => Promise<RawEvidence[]>;
  /** Legibility cap on extracted claims for this run (from RunConfig.maxClaims). */
  maxClaims: number;
  /** Legibility cap on resolving questions per claim (from RunConfig.maxQuestions). */
  maxQuestions: number;
  /**
   * Optional fact-check short-circuit. Present only when RunConfig.factCheckShortCircuit is
   * on (and a key is available); ABSENT is the off switch — the pipeline then runs fully de
   * novo. Given a claim, returns any existing fact-checks of it (empty = none / lookup failed).
   */
  factCheck?: (query: string) => Promise<FactCheckHit[]>;
}
