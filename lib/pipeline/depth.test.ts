import { describe, it, expect, vi } from "vitest";
import { normalizeUrl, dedupLinks, gatherDepth } from "./depth";
import type { ClaimItem, QuestionItem } from "../graph-types";
import type { FetchedSource, RawEvidence } from "../exa";
import type { PipelineDeps, DepthDeps } from "./deps";

describe("normalizeUrl", () => {
  it("collapses protocol, www, trailing slash, and hash to one key", () => {
    const a = normalizeUrl("https://www.Example.com/Story/");
    const b = normalizeUrl("http://example.com/Story#section");
    expect(a).toBe(b);
  });

  it("keeps distinct paths distinct", () => {
    expect(normalizeUrl("https://x.com/a")).not.toBe(normalizeUrl("https://x.com/b"));
  });

  it("falls back gracefully for an unparseable URL", () => {
    expect(normalizeUrl("not a url")).toBe("not a url");
  });
});

describe("dedupLinks", () => {
  it("drops links already in the seen ledger", () => {
    const seen = new Set([normalizeUrl("https://a.com/1")]);
    expect(dedupLinks(["https://a.com/1", "https://b.com/2"], seen)).toEqual(["https://b.com/2"]);
  });

  it("collapses duplicates within the same page", () => {
    expect(dedupLinks(["https://a.com/1", "https://www.a.com/1/"], new Set())).toEqual([
      "https://a.com/1",
    ]);
  });

  it("skips non-http, asset, and anchor links", () => {
    const links = [
      "mailto:x@y.com",
      "#top",
      "/relative",
      "https://a.com/img.png",
      "https://a.com/story",
    ];
    expect(dedupLinks(links, new Set())).toEqual(["https://a.com/story"]);
  });

  it("caps the frontier at the limit", () => {
    const links = Array.from({ length: 30 }, (_, i) => `https://a.com/${i}`);
    expect(dedupLinks(links, new Set(), 5)).toHaveLength(5);
  });
});

// --- gatherDepth (the walk bookkeeping) --------------------------------------------------------

const claim: ClaimItem = { id: "c1", text: "claim", verdict: null, checkable: true };
const question: QuestionItem = {
  id: "q1",
  claimId: "c1",
  text: "did it happen?",
  status: "searching",
};

function fetched(url: string, links: string[]): FetchedSource {
  const domain = new URL(url).hostname.replace(/^www\./, "");
  return { title: url, url, domain, passage: "excerpt", text: "body", links };
}

function seedResult(url: string): RawEvidence {
  const domain = new URL(url).hostname.replace(/^www\./, "");
  return { title: url, url, domain, passage: "snip", text: "body" };
}

/** Build mock deps; `drive` simulates the model by calling the tool executor (onTool). */
function makeDeps(opts: {
  search: ReturnType<typeof vi.fn>;
  fetchSource: ReturnType<typeof vi.fn>;
  drive: (onTool: (n: string, i: unknown) => Promise<unknown>) => Promise<void>;
}): PipelineDeps & { depth: DepthDeps } {
  const askWithTools = vi.fn(
    async (_prompt: string, o: { onTool: (n: string, i: unknown) => Promise<unknown> }) => {
      await opts.drive(o.onTool);
      return { text: "walked seed → origin", toolCalls: [], steps: 1 };
    },
  );
  return {
    ask: { askText: vi.fn(), askJSON: vi.fn(), askWithTools } as unknown as PipelineDeps["ask"],
    search: opts.search as unknown as PipelineDeps["search"],
    maxClaims: 1,
    maxQuestions: 1,
    depth: { fetchSource: opts.fetchSource as unknown as DepthDeps["fetchSource"], maxHops: 6 },
  };
}

describe("gatherDepth", () => {
  it("records the walk in order, labelling each hop's via and dedup-skipping a repeat", async () => {
    const search = vi.fn(async () => [seedResult("https://seed.com/x")]);
    const fetchSource = vi.fn(async (url: string) =>
      url.includes("seed.com") ? fetched(url, ["https://a.com/1"]) : fetched(url, []),
    );
    const deps = makeDeps({
      search,
      fetchSource,
      // Model: follow the searched seed (via "search"), then a link off it (via "link"), then
      // repeat the same link (deduped — no new hop).
      drive: async (onTool) => {
        await onTool("follow_link", { url: "https://seed.com/x" });
        await onTool("follow_link", { url: "https://a.com/1" });
        await onTool("follow_link", { url: "https://a.com/1" });
      },
    });

    const out = await gatherDepth(claim, question, "seed query", undefined, deps);

    expect(out.walk).toEqual([
      { depth: 0, domain: "seed.com", url: "https://seed.com/x", via: "search" },
      { depth: 1, domain: "a.com", url: "https://a.com/1", via: "link" },
    ]);
    expect(out.gathered).toHaveLength(2);
    expect(out.depthByUrl.get(normalizeUrl("https://a.com/1"))).toBe(1);
    expect(out.queries).toContain("seed query");
    // The duplicate follow did NOT trigger a third fetch.
    expect(fetchSource).toHaveBeenCalledTimes(2);
  });

  it("falls back to the top seed result when the model never follows a link", async () => {
    const search = vi.fn(async () => [seedResult("https://seed.com/x")]);
    const fetchSource = vi.fn(async (url: string) => fetched(url, []));
    const deps = makeDeps({ search, fetchSource, drive: async () => {} });

    const out = await gatherDepth(claim, question, "seed query", undefined, deps);

    expect(out.walk).toHaveLength(1);
    expect(out.gathered).toHaveLength(1);
    expect(out.gathered[0].url).toBe("https://seed.com/x");
  });

  it("stops following once the hop cap is reached", async () => {
    const search = vi.fn(async () => [seedResult("https://seed.com/x")]);
    // Every page links onward, so only the maxHops cap can stop the walk.
    const fetchSource = vi.fn(async (url: string) => {
      const n = Number(url.match(/(\d+)$/)?.[1] ?? "0");
      return fetched(url, [`https://chain.com/${n + 1}`]);
    });
    const deps = makeDeps({
      search,
      fetchSource,
      drive: async (onTool) => {
        for (let i = 0; i < 10; i++) await onTool("follow_link", { url: `https://chain.com/${i}` });
      },
    });

    const out = await gatherDepth(claim, question, "seed query", undefined, deps);
    expect(out.walk.length).toBe(6); // MAX_HOPS in the mock deps
  });
});
