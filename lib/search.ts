import {
  createExaSearch,
  createExaFetch,
  type ExaSearchConfig,
  type SearchOptions,
  type RawEvidence,
  type FetchedSource,
} from "./exa";
import { EXA_CATEGORIES, type ExaCategory } from "./run-config";

// Provider-neutral search seam (#10, ADR 0009) — the retrieval analogue of the ReasoningProvider
// seam (ADR 0004). The pipeline depends on `SearchFn`, never on a concrete backend, so a second
// search backend (a cheaper / free API) can drop in behind `createSearchProvider` without touching
// the gather loop. Today the only backend is Exa; this is the seam, not a second implementation.

/** One web search bound to a run's config + key. The unit the gather loop calls per query. */
export type SearchFn = (query: string, opts?: SearchOptions) => Promise<RawEvidence[]>;

/** Fetch one page by URL (text + outbound links) — the depth-mode walk's "visit a source" unit. */
export type FetchFn = (url: string, opts?: SearchOptions) => Promise<FetchedSource>;

/** What a backend can do — so the settings UI can disable options a backend doesn't support. */
export interface SearchCapabilities {
  /** Supports an agentic "deep" search mode (higher recall, slower, pricier). */
  deepSearch: boolean;
  /** Content categories the backend can filter to ([] = no category filtering). */
  categories: readonly ExaCategory[];
  /** Can prefer freshly-crawled content over a cache. */
  freshCrawl: boolean;
  /** Can fetch a page's outbound links by URL — the requirement for depth mode's link-following. */
  followLinks: boolean;
}

export interface SearchProvider {
  /** Stable backend id (e.g. "exa") — for the trace / settings UI. */
  name: string;
  capabilities: SearchCapabilities;
  search: SearchFn;
  /** Present only on backends that can follow links (capabilities.followLinks) — depth mode. */
  fetchSource?: FetchFn;
}

// Exa supports every retrieval knob the pipeline exposes today.
const EXA_CAPABILITIES: SearchCapabilities = {
  deepSearch: true,
  categories: EXA_CATEGORIES,
  freshCrawl: true,
  followLinks: true,
};

/**
 * Build the search provider for a run. Routes to Exa (the only backend today); the return type is
 * provider-neutral so additional backends slot in here without changing callers. Mirrors
 * `createReasoner` on the LLM side (ADR 0004). `linksPerSource` (depth mode) sizes the link frontier
 * pulled off each visited page.
 */
export function createSearchProvider(
  config: ExaSearchConfig & { linksPerSource?: number },
): SearchProvider {
  return {
    name: "exa",
    capabilities: EXA_CAPABILITIES,
    search: createExaSearch(config),
    fetchSource: createExaFetch(config),
  };
}
