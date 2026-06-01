import { createExaSearch, type ExaSearchConfig, type SearchOptions, type RawEvidence } from "./exa";
import { EXA_CATEGORIES, type ExaCategory } from "./run-config";

// Provider-neutral search seam (#10, ADR 0009) — the retrieval analogue of the ReasoningProvider
// seam (ADR 0004). The pipeline depends on `SearchFn`, never on a concrete backend, so a second
// search backend (a cheaper / free API) can drop in behind `createSearchProvider` without touching
// the gather loop. Today the only backend is Exa; this is the seam, not a second implementation.

/** One web search bound to a run's config + key. The unit the gather loop calls per query. */
export type SearchFn = (query: string, opts?: SearchOptions) => Promise<RawEvidence[]>;

/** What a backend can do — so the settings UI can disable options a backend doesn't support. */
export interface SearchCapabilities {
  /** Supports an agentic "deep" search mode (higher recall, slower, pricier). */
  deepSearch: boolean;
  /** Content categories the backend can filter to ([] = no category filtering). */
  categories: readonly ExaCategory[];
  /** Can prefer freshly-crawled content over a cache. */
  freshCrawl: boolean;
}

export interface SearchProvider {
  /** Stable backend id (e.g. "exa") — for the trace / settings UI. */
  name: string;
  capabilities: SearchCapabilities;
  search: SearchFn;
}

// Exa supports every retrieval knob the pipeline exposes today.
const EXA_CAPABILITIES: SearchCapabilities = {
  deepSearch: true,
  categories: EXA_CATEGORIES,
  freshCrawl: true,
};

/**
 * Build the search provider for a run. Routes to Exa (the only backend today); the return type is
 * provider-neutral so additional backends slot in here without changing callers. Mirrors
 * `createReasoner` on the LLM side (ADR 0004).
 */
export function createSearchProvider(config: ExaSearchConfig): SearchProvider {
  return { name: "exa", capabilities: EXA_CAPABILITIES, search: createExaSearch(config) };
}
