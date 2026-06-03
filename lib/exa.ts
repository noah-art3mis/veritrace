import Exa from "exa-js";
import { DEFAULT_SOURCES, DEFAULT_CHARS, type ExaCategory } from "./run-config";
import { withRetry, isTransientNetworkError } from "./retry";

// The short, query-focused excerpt shown on each evidence card. Kept small for legibility —
// separate from `maxChars`, which governs how much full text the *classifier* reads.
const HIGHLIGHT_CHARS = 512;

// Fact-check outlets are EXCLUDED from every retrieval. This is the mechanical
// enforcement of VERITRACE's de-novo honesty bar: the pipeline must reach its own
// verdict from primary evidence, never by reading a third party's finished
// fact-check. These same outlets live in demo-corpus/SOURCES.md as the *answer key*
// (grading only) — they are never fed into the graph. See CONTEXT.md / PLAN.md.
export const FACT_CHECKERS = [
  "politifact.com",
  "afp.com",
  "factchequeado.com",
  "fullfact.org",
  "snopes.com",
  "mediabiasfactcheck.com",
  "newsguardrealitycheck.com",
  "revistaespejo.com",
  "lacuartatransformacion.org",
  "verificat.cat",
  "prensalibre.com",
];

export interface RawEvidence {
  title: string;
  url: string;
  domain: string;
  faviconUrl?: string;
  publishedDate?: string;
  /** Short query-relevant excerpt (Exa highlight) — shown on the card. Falls back to text. */
  passage: string;
  /** Fuller extracted page text (up to maxChars) — what the classifier actually reads. */
  text: string;
}

/** Optional per-search bounds. The date window keeps stale and post-event sources out. */
export interface SearchOptions {
  startPublishedDate?: string; // ISO; exclude sources published before this
  endPublishedDate?: string; // ISO; exclude sources published after this
  /** Focus the highlight on this text (the question being resolved), not the keyword query. */
  highlightQuery?: string;
}

/** Per-run retrieval configuration baked into the search closure. */
export interface ExaSearchConfig {
  /** User-supplied key; blank ⇒ the server's EXA_API_KEY env. */
  exaKey?: string;
  /** Sources per search (Exa numResults). */
  numResults?: number;
  /** Chars of full page text read per source (Exa contents.text.maxCharacters). */
  maxChars?: number;
  /** Exa's agentic "deep" search instead of "auto". */
  deepSearch?: boolean;
  /** Restrict to an Exa content category for cleaner extraction; "" = no restriction. */
  category?: ExaCategory | "";
  /** Prefer freshly-crawled content over Exa's cache (fresher, slower). */
  preferFresh?: boolean;
}

/**
 * Build an Exa search bound to one API key (the user's, or the EXA_API_KEY env fallback).
 * The returned function does one search per Question node. Direct call — not Claude
 * function-calling — because our pipeline is deterministic: we decide when to search.
 * `excludeDomains` enforces de-novo retrieval. `type: "auto"` is the balanced ~1s default;
 * `deepSearch` swaps in Exa's agentic `"deep"` type (higher recall, slower, pricier) for hard
 * claims. `numResults` bounds the graph for legibility; `maxChars` caps how much page text the
 * classifier reads; `category` optionally restricts to a content type (cleaner extraction); and
 * `preferFresh` opts into live crawling. By default we omit livecrawl so cache is served, which
 * is what makes rehearsed demo chips return fast on stage.
 */
export function createExaSearch(
  cfg: ExaSearchConfig = {},
): (query: string, opts?: SearchOptions) => Promise<RawEvidence[]> {
  const {
    exaKey,
    numResults = DEFAULT_SOURCES,
    maxChars = DEFAULT_CHARS,
    deepSearch = false,
    category = "",
    preferFresh = false,
  } = cfg;
  const apiKey = exaKey || process.env.EXA_API_KEY;
  if (!apiKey) throw new Error("EXA_API_KEY is not set (and no key was provided)");
  const client = new Exa(apiKey);

  return async function retrieveEvidence(
    query: string,
    opts: SearchOptions = {},
  ): Promise<RawEvidence[]> {
    // De-novo exclusion turned OFF for now: fact-check outlets (FACT_CHECKERS) are
    // currently allowed back into retrieval so the pipeline can reach primary sources
    // even when they only surface via a fact-check's citations. Re-add
    // `excludeDomains: FACT_CHECKERS` here to restore the strict de-novo honesty bar.
    // A claim-date window (when known) keeps stale pre-event matches and far-future
    // re-litigation out, while still admitting the day-of/after primary reporting.
    const base = {
      numResults,
      ...(opts.startPublishedDate ? { startPublishedDate: opts.startPublishedDate } : {}),
      ...(opts.endPublishedDate ? { endPublishedDate: opts.endPublishedDate } : {}),
      ...(category ? { category } : {}),
    };
    // Highlights are query-focused (on the question being resolved) and stay short for the
    // card; `text` is the fuller body the classifier reads. `livecrawl: "preferred"` opts into
    // fresh content. Each branch inlines `contents` so the SDK can infer the result shape.
    const contents = {
      highlights: { query: opts.highlightQuery, maxCharacters: HIGHLIGHT_CHARS },
      text: { maxCharacters: maxChars },
      ...(preferFresh ? { livecrawl: "preferred" as const } : {}),
    };
    // Retry transient network blips (ETIMEDOUT, connection resets, Exa 5xx). The dev runs over a
    // consumer link and serverless cold-starts, where a first request often times out then
    // succeeds — without this, one blip would degrade the question (issue #70).
    const { results } = await withRetry(
      () =>
        deepSearch
          ? client.search(query, { type: "deep", ...base, contents })
          : client.search(query, { type: "auto", ...base, contents }),
      { attempts: 3, isRetryable: isTransientNetworkError },
    );

    return results.map((r) => {
      const highlight = Array.isArray(r.highlights) ? r.highlights[0] : undefined;
      const text = typeof r.text === "string" ? r.text : undefined;
      // Card passage prefers the short highlight; the classifier's `text` prefers the full body.
      const passage = (highlight || text || "").trim();
      return {
        title: r.title ?? r.url,
        url: r.url,
        domain: domainOf(r.url),
        faviconUrl: r.favicon || faviconFor(r.url),
        publishedDate: r.publishedDate?.slice(0, 10),
        passage,
        text: (text || highlight || "").trim(),
      };
    });
  };
}

/** One page fetched by URL in depth mode: its text/excerpt as evidence, plus its outbound links. */
export interface FetchedSource extends RawEvidence {
  /** Outbound links found on the page (Exa contents.extras.links) — the depth walk's frontier. */
  links: string[];
}

/**
 * Build a "fetch one page by URL" function bound to a run's Exa key — the depth-mode counterpart to
 * the search closure. Where `createExaSearch` finds candidate sources, this VISITS a specific source
 * the walk chose: it returns the page as a `RawEvidence` (so the same classifier reads it) PLUS the
 * outbound links Exa scraped off the page, which become the next hop's frontier. We ask Exa for the
 * fuller `text` (the classifier reads it), a question-focused `highlight` (the card excerpt), and up
 * to `linksPerSource` on-page `extras.links`. `livecrawl: "preferred"` is on by default here — a
 * page we are deliberately walking to is worth a fresh crawl so its links aren't a stale snapshot.
 */
export function createExaFetch(
  cfg: ExaSearchConfig & { linksPerSource?: number } = {},
): (url: string, opts?: SearchOptions) => Promise<FetchedSource> {
  const { exaKey, maxChars = DEFAULT_CHARS, linksPerSource = 12 } = cfg;
  const apiKey = exaKey || process.env.EXA_API_KEY;
  if (!apiKey) throw new Error("EXA_API_KEY is not set (and no key was provided)");
  const client = new Exa(apiKey);

  return async function fetchSource(url: string, opts: SearchOptions = {}): Promise<FetchedSource> {
    const { results } = await withRetry(
      () =>
        client.getContents([url], {
          text: { maxCharacters: maxChars },
          highlights: { query: opts.highlightQuery, maxCharacters: HIGHLIGHT_CHARS },
          extras: { links: linksPerSource },
          livecrawl: "preferred",
        }),
      { attempts: 3, isRetryable: isTransientNetworkError },
    );
    const r = results[0];
    if (!r) throw new Error(`Exa returned no contents for ${url}`);
    const highlight = Array.isArray(r.highlights) ? r.highlights[0] : undefined;
    const text = typeof r.text === "string" ? r.text : undefined;
    const passage = (highlight || text || "").trim();
    const links = Array.isArray(r.extras?.links) ? r.extras.links : [];
    return {
      title: r.title ?? r.url,
      url: r.url,
      domain: domainOf(r.url),
      faviconUrl: r.favicon || faviconFor(r.url),
      publishedDate: r.publishedDate?.slice(0, 10),
      passage,
      text: (text || highlight || "").trim(),
      links,
    };
  };
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function faviconFor(url: string): string {
  return `https://www.google.com/s2/favicons?domain=${domainOf(url)}&sz=64`;
}
