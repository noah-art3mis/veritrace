import type { ClaimItem, QuestionItem, WalkStep } from "../graph-types";
import type { RawEvidence, SearchOptions } from "../exa";
import type { ToolDef } from "../reasoner-types";
import type { PipelineDeps, DepthDeps } from "./deps";
// Type-only import (erased at runtime, so no cycle with resolve.ts, which imports gatherDepth).
import type { RetrievalOutcome } from "./resolve";

// Depth-first gather — the breadth gather's twin (resolve.ts). The breadth loop fans OUT: it issues
// several parallel queries under one question and keeps every reliable source it finds. The depth
// loop goes IN: it visits ONE source, reads the page, follows the single most origin-likely outbound
// link (after dedup), and repeats — walking the citation chain back toward the originating report.
// When a page's links dead-end, the agent searches for the lead the article names (the outlet,
// agency, author, or registry it attributes the story to) and follows that instead. This is the
// "trace to the origin, not the echo" idea (README) made literal: every hop is a step closer to the
// primary source rather than a wider net over re-reporting.
//
// The graph stays 4 layers. Each visited page is still Evidence under the same Question; the only
// new signal is the hop index (`depth`) recorded per source and the ordered `walk` on the trace —
// the retrieval *process* gained depth, the *topology* did not.

const FOLLOW_TOOL: ToolDef = {
  name: "follow_link",
  description:
    "Visit ONE page by URL and read it. Returns the page's excerpt plus its outbound links (the candidates for the next hop). Use this to walk from a re-report toward the source it cites. Links already visited are deduped away.",
  input_schema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description:
          "The exact URL to visit next (from a search result or a previous page's links).",
      },
    },
    required: ["url"],
  },
};

const SEARCH_TOOL: ToolDef = {
  name: "search_evidence",
  description:
    "Search the open web — use this to find the FIRST source to start from, or when a page's links dead-end, to look up the lead the article names (the originating outlet, agency, author, or registry it attributes the story to).",
  input_schema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "A focused, standalone web query (include date/place/actor).",
      },
    },
    required: ["query"],
  },
};

function depthSystem(maxHops: number): string {
  return `You are the evidence-gathering stage of VERITRACE in DEPTH mode, resolving ONE question about ONE claim by tracing it back to its ORIGINATING source — not by collecting many parallel results.

Work DEPTH-FIRST, one chain at a time:
1. search_evidence once to find a promising starting source for the question.
2. follow_link to that source, read it, and look at its outbound links. Follow the SINGLE link most likely to lead toward the ORIGIN — the firsthand report, official statement, news wire, or registry the page is citing or re-reporting. Avoid navigation/section/social links.
3. Repeat: each hop should get you CLOSER to the primary source, not wider. Do NOT fan out across unrelated results.
4. If a page's links dead-end (no link points further toward the source), use the NEW information the article gives you — the outlet it credits, the agency or spokesperson it quotes, the author, the dateline — to search_evidence for that originating source, then follow_link to it.

Stop when you have reached a primary/originating source (or an authoritative source that confirms or denies the claim firsthand), or after about ${maxHops} hops. Already-visited links are deduped, so don't loop. Never fabricate — only what the tools return counts.

When done, reply with a one-line summary of the chain you followed and where it led.`;
}

/**
 * Normalize a URL for dedup: lowercase host, drop protocol, a leading "www.", the hash, any
 * trailing slash, and a trailing "?". Two URLs that point at the same page collapse to one key so
 * the walk never re-reads a page (or loops). Falls back to the trimmed input for unparseable URLs.
 */
export function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    const path = u.pathname.replace(/\/+$/, "");
    return `${host}${path}${u.search}`.toLowerCase();
  } catch {
    return trimmed
      .replace(/^https?:\/\//, "")
      .replace(/^www\./, "")
      .replace(/\/+$/, "")
      .toLowerCase();
  }
}

/**
 * Filter a page's outbound links down to the unvisited, non-duplicate frontier for the next hop.
 * Drops anything already in `seen` (visited or previously offered), collapses duplicates by
 * normalized form, skips obvious non-article links (mailto/anchor/asset/social-share), and caps the
 * list so the model picks from a legible frontier. Pure — `seen` is read, not mutated.
 */
export function dedupLinks(links: string[], seen: Set<string>, limit = 12): string[] {
  const out: string[] = [];
  const local = new Set<string>();
  for (const raw of links) {
    const url = raw.trim();
    if (!/^https?:\/\//i.test(url)) continue; // skip mailto:, #anchors, relative, javascript:
    if (/\.(jpg|jpeg|png|gif|svg|webp|css|js|ico|mp4|pdf)(\?|$)/i.test(url)) continue; // assets
    const key = normalizeUrl(url);
    if (seen.has(key) || local.has(key)) continue;
    local.add(key);
    out.push(url);
    if (out.length >= limit) break;
  }
  return out;
}

/** What the depth walk returns to resolveQuestion — visited pages (in order) + the trace material. */
export interface DepthGather {
  /** Every page the walk visited, in hop order — the evidence candidates to classify. */
  gathered: RawEvidence[];
  /** url → hop index, so resolveQuestion can re-attach `depth` to the classified evidence. */
  depthByUrl: Map<string, number>;
  /** The ordered chain of sources, for the question trace (transparency principle). */
  walk: WalkStep[];
  /** Every query the agent issued (seed + dead-end jumps), for the trace. */
  queries: string[];
  /** The agent's closing one-line summary of the chain it followed. */
  summary: string;
  /** Search tally so a wholesale retrieval outage is detectable in depth mode too (#100). */
  retrieval: RetrievalOutcome;
}

/**
 * Walk one question's claim toward its origin. Seeds with one search, then lets the model alternate
 * follow_link (go deeper) and search_evidence (jump to a named lead when links dead-end), deduping
 * every URL so a page is never re-read. Only VISITED pages (follow_link) become evidence; search
 * results are merely the candidates the model chooses its next hop from. As a backstop, if the model
 * never follows anything we auto-visit the top seed result, so a question always yields ≥1 source.
 */
export async function gatherDepth(
  claim: ClaimItem,
  question: QuestionItem,
  seedQuery: string,
  window: SearchOptions | undefined,
  deps: PipelineDeps & { depth: DepthDeps },
): Promise<DepthGather> {
  const { fetchSource, maxHops } = deps.depth;
  const seen = new Set<string>(); // every URL visited OR offered as a candidate — the dedup ledger
  const fromSearch = new Set<string>(); // URLs that surfaced via search (vs a page's links) — for `via`
  const collected = new Map<string, RawEvidence>();
  const depthByUrl = new Map<string, number>();
  const walk: WalkStep[] = [];
  const queries: string[] = [];
  // Count every search + its outcome so the orchestrator can spot a wholesale retrieval outage (#100)
  // in depth mode as well — the catch below swallows failures (like breadth), which would otherwise
  // masquerade as a plain no-origin-found NEI.
  const retrieval: RetrievalOutcome = { searches: 0, failures: 0 };

  const opts: SearchOptions = { ...window, highlightQuery: question.text };

  async function runSearch(query: string): Promise<RawEvidence[]> {
    queries.push(query);
    retrieval.searches++;
    try {
      const results = await deps.search(query, opts);
      for (const r of results) {
        seen.add(normalizeUrl(r.url));
        fromSearch.add(normalizeUrl(r.url));
      }
      return results;
    } catch (err) {
      retrieval.failures++;
      retrieval.lastError = err instanceof Error ? err.message : String(err);
      return [];
    }
  }

  // Seed the walk with one search so the agent has a starting source (and a fallback to auto-visit).
  const seedResults = await runSearch(seedQuery);

  async function onTool(name: string, input: unknown): Promise<unknown> {
    if (name === "search_evidence") {
      const query = (input as { query?: string }).query ?? "";
      const results = await runSearch(query);
      // Hand back just the leads (url/title/snippet); the model picks one to follow_link.
      return results.map((r) => ({
        url: r.url,
        title: r.title,
        domain: r.domain,
        snippet: r.passage,
      }));
    }
    if (name === "follow_link") {
      if (collected.size >= maxHops) {
        return { note: `depth cap (${maxHops} hops) reached — stop and summarize the chain.` };
      }
      const url = (input as { url?: string }).url ?? "";
      const key = normalizeUrl(url);
      const alreadyVisited = depthByUrl.has(key);
      if (alreadyVisited) return { note: "already visited (deduped) — follow a different link." };
      const via: WalkStep["via"] = fromSearch.has(key) ? "search" : "link";
      try {
        const page = await fetchSource(url, opts);
        const depth = walk.length;
        collected.set(page.url, page);
        depthByUrl.set(key, depth);
        walk.push({ depth, domain: page.domain, url: page.url, via });
        const frontier = dedupLinks(page.links, seen);
        for (const l of frontier) seen.add(normalizeUrl(l)); // offered ⇒ won't be re-offered
        return {
          domain: page.domain,
          title: page.title,
          published: page.publishedDate ?? "unknown",
          excerpt: (page.text || page.passage).slice(0, 1200),
          links: frontier,
          hop: depth,
        };
      } catch (err) {
        return { error: `could not fetch: ${err instanceof Error ? err.message : String(err)}` };
      }
    }
    return { error: `unknown tool: ${name}` };
  }

  const result = await deps.ask.askWithTools(
    `Claim: "${claim.text}"\nQuestion: "${question.text}"\n\nA good first query is already run; ${seedResults.length} candidate source(s) are available. Start by following the most promising one toward the ORIGIN, then keep walking the citation chain inward.\n\nFirst candidates:\n${seedResults.map((r) => `- ${r.url} — ${r.title}`).join("\n") || "(none — search for a starting source)"}`,
    {
      system: depthSystem(maxHops),
      tools: [SEARCH_TOOL, FOLLOW_TOOL],
      onTool,
      maxSteps: maxHops * 2 + 2,
      maxTokens: 700,
    },
  );

  // Backstop: the model searched but never followed anything — visit the top seed result so the
  // question still resolves on a real source rather than coming back empty.
  if (collected.size === 0 && seedResults.length > 0) {
    try {
      const page = await fetchSource(seedResults[0].url, opts);
      collected.set(page.url, page);
      depthByUrl.set(normalizeUrl(page.url), 0);
      walk.push({ depth: 0, domain: page.domain, url: page.url, via: "search" });
    } catch {
      // Even the fetch failed — fall back to the raw seed result so we're not wholly empty.
      const r = seedResults[0];
      collected.set(r.url, r);
      depthByUrl.set(normalizeUrl(r.url), 0);
      walk.push({ depth: 0, domain: r.domain, url: r.url, via: "search" });
    }
  }

  return {
    gathered: [...collected.values()],
    depthByUrl,
    walk,
    queries,
    summary: result.text.trim(),
    retrieval,
  };
}
