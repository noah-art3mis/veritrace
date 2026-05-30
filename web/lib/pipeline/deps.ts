import type { AnthropicCaller } from "../anthropic";
import type { RawEvidence, SearchOptions } from "../exa";

// The per-request dependencies threaded through the pipeline: a model caller and an
// evidence search, both already bound to this run's config + API keys (see createAnthropic
// / createExaSearch). Stages take these explicitly rather than reaching for module globals,
// so each request runs with its own model, temperature, thinking setting, and keys.
export interface PipelineDeps {
  ask: AnthropicCaller;
  search: (query: string, opts?: SearchOptions) => Promise<RawEvidence[]>;
}
