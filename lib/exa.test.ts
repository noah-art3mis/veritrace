import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the options passed to Exa.search (and the constructor key) so we can assert
// de-novo exclusion and per-request key resolution.
const searchMock = vi.fn();
const getContentsMock = vi.fn();
const ctorMock = vi.fn();

vi.mock("exa-js", () => {
  return {
    default: class FakeExa {
      search = searchMock;
      getContents = getContentsMock;
      constructor(key: string) {
        ctorMock(key);
      }
    },
  };
});

import { createExaSearch, createExaFetch } from "./exa";
import { DEFAULT_CHARS } from "./run-config";

beforeEach(() => {
  searchMock.mockReset();
  getContentsMock.mockReset();
  ctorMock.mockReset();
  process.env.EXA_API_KEY = "env-key";
});

function withResults(results: unknown[]) {
  searchMock.mockResolvedValue({ results });
}

const search = () => createExaSearch();
// Most result-mapping cases supply both a highlight and text; assert on whichever field matters.

describe("createExaSearch — de-novo retrieval", () => {
  it("does not exclude fact-check outlets — the de-novo bar is turned off for now", async () => {
    withResults([]);
    await search()("did X happen?");
    const opts = searchMock.mock.calls[0][1];
    expect(opts).not.toHaveProperty("excludeDomains");
  });

  it("caps results for graph legibility and requests highlights+text", async () => {
    withResults([]);
    await search()("did X happen?");
    const opts = searchMock.mock.calls[0][1];
    expect(opts.numResults).toBe(2);
    expect(opts.contents.highlights.maxCharacters).toBeGreaterThan(0);
    expect(opts.contents.text.maxCharacters).toBe(DEFAULT_CHARS);
  });

  it("forwards a per-run source cap to Exa numResults", async () => {
    withResults([]);
    await createExaSearch({ exaKey: "user-key", numResults: 4 })("did X happen?");
    expect(searchMock.mock.calls[0][1].numResults).toBe(4);
  });

  it("forwards a per-run read-depth cap to Exa contents.text.maxCharacters", async () => {
    withResults([]);
    await createExaSearch({ exaKey: "user-key", maxChars: 4000 })("did X happen?");
    expect(searchMock.mock.calls[0][1].contents.text.maxCharacters).toBe(4000);
  });

  it("focuses highlights on the supplied highlightQuery (the question), not the keyword query", async () => {
    withResults([]);
    await search()("keyword query", { highlightQuery: "did the airport get seized?" });
    expect(searchMock.mock.calls[0][1].contents.highlights.query).toBe(
      "did the airport get seized?",
    );
  });

  it("uses the standard 'auto' search type by default and no category/livecrawl", async () => {
    withResults([]);
    await search()("did X happen?");
    const opts = searchMock.mock.calls[0][1];
    expect(opts.type).toBe("auto");
    expect(opts).not.toHaveProperty("category");
    expect(opts.contents).not.toHaveProperty("livecrawl");
  });

  it("switches to Exa 'deep' search when the deep flag is set", async () => {
    withResults([]);
    await createExaSearch({ exaKey: "user-key", deepSearch: true })("did X happen?");
    const opts = searchMock.mock.calls[0][1];
    expect(opts.type).toBe("deep");
    // Deep search must still return contents so the passage/highlight pipeline works.
    expect(opts.contents.text.maxCharacters).toBe(DEFAULT_CHARS);
  });

  it("restricts to an Exa category when one is configured", async () => {
    withResults([]);
    await createExaSearch({ exaKey: "user-key", category: "news" })("did X happen?");
    expect(searchMock.mock.calls[0][1].category).toBe("news");
  });

  it("opts into live crawling when preferFresh is set", async () => {
    withResults([]);
    await createExaSearch({ exaKey: "user-key", preferFresh: true })("did X happen?");
    expect(searchMock.mock.calls[0][1].contents.livecrawl).toBe("preferred");
  });

  it("passes the question text through as the query", async () => {
    withResults([]);
    await search()("did X happen?");
    expect(searchMock.mock.calls[0][0]).toBe("did X happen?");
  });

  it("omits date bounds entirely when no window is supplied", async () => {
    withResults([]);
    await search()("did X happen?");
    const opts = searchMock.mock.calls[0][1];
    expect(opts).not.toHaveProperty("startPublishedDate");
    expect(opts).not.toHaveProperty("endPublishedDate");
  });

  it("forwards a supplied date window to Exa (claim-date leakage/staleness guard)", async () => {
    withResults([]);
    await search()("did X happen?", {
      startPublishedDate: "2026-01-23",
      endPublishedDate: "2026-03-08",
    });
    const opts = searchMock.mock.calls[0][1];
    expect(opts.startPublishedDate).toBe("2026-01-23");
    expect(opts.endPublishedDate).toBe("2026-03-08");
  });
});

describe("createExaSearch — result mapping", () => {
  it("derives the bare domain from the url, stripping www.", async () => {
    withResults([{ url: "https://www.bbc.co.uk/news/x", title: "T", highlights: ["h"] }]);
    const [ev] = await search()("q");
    expect(ev.domain).toBe("bbc.co.uk");
  });

  it("prefers the first highlight as the card passage", async () => {
    withResults([
      { url: "https://x.com", title: "T", highlights: ["the highlight"], text: "the full text" },
    ]);
    const [ev] = await search()("q");
    expect(ev.passage).toBe("the highlight");
  });

  it("exposes the fuller text separately for the classifier even when a highlight exists", async () => {
    withResults([
      { url: "https://x.com", title: "T", highlights: ["the highlight"], text: "the full text" },
    ]);
    const [ev] = await search()("q");
    // The card shows the short highlight; the classifier reads the full body.
    expect(ev.passage).toBe("the highlight");
    expect(ev.text).toBe("the full text");
  });

  it("falls back to text when no highlight is present", async () => {
    withResults([{ url: "https://x.com", title: "T", text: "  the full text  " }]);
    const [ev] = await search()("q");
    expect(ev.passage).toBe("the full text");
  });

  it("falls back to the url as title when the result has none", async () => {
    withResults([{ url: "https://x.com/a", highlights: ["h"] }]);
    const [ev] = await search()("q");
    expect(ev.title).toBe("https://x.com/a");
  });

  it("uses the provided favicon when present", async () => {
    withResults([
      { url: "https://x.com", title: "T", favicon: "https://x.com/fav.ico", highlights: ["h"] },
    ]);
    const [ev] = await search()("q");
    expect(ev.faviconUrl).toBe("https://x.com/fav.ico");
  });

  it("synthesizes a google s2 favicon url when the result lacks one", async () => {
    withResults([{ url: "https://x.com", title: "T", highlights: ["h"] }]);
    const [ev] = await search()("q");
    expect(ev.faviconUrl).toBe("https://www.google.com/s2/favicons?domain=x.com&sz=64");
  });

  it("truncates the published date to a YYYY-MM-DD day", async () => {
    withResults([
      {
        url: "https://x.com",
        title: "T",
        highlights: ["h"],
        publishedDate: "2026-02-22T14:26:00Z",
      },
    ]);
    const [ev] = await search()("q");
    expect(ev.publishedDate).toBe("2026-02-22");
  });

  it("returns an empty passage when neither highlight nor text is available", async () => {
    withResults([{ url: "https://x.com", title: "T" }]);
    const [ev] = await search()("q");
    expect(ev.passage).toBe("");
  });
});

describe("createExaSearch — API key resolution", () => {
  it("prefers the user-supplied key over the env key", async () => {
    withResults([]);
    await createExaSearch({ exaKey: "user-key" })("q");
    expect(ctorMock).toHaveBeenCalledWith("user-key");
  });

  it("falls back to the env key when no user key is given", async () => {
    withResults([]);
    await createExaSearch()("q");
    expect(ctorMock).toHaveBeenCalledWith("env-key");
  });

  it("throws a clear error when neither a user key nor EXA_API_KEY is present", () => {
    delete process.env.EXA_API_KEY;
    expect(() => createExaSearch()).toThrow(/EXA_API_KEY/);
  });
});

describe("createExaFetch — depth-mode link following", () => {
  function withPage(result: unknown) {
    getContentsMock.mockResolvedValue({ results: [result] });
  }

  it("requests text, a question-focused highlight, and on-page links", async () => {
    withPage({ url: "https://a.com/1", title: "T", text: "body" });
    await createExaFetch({ linksPerSource: 9 })("https://a.com/1", {
      highlightQuery: "did it happen?",
    });
    const [urls, opts] = getContentsMock.mock.calls[0];
    expect(urls).toEqual(["https://a.com/1"]);
    expect(opts.extras.links).toBe(9);
    expect(opts.text.maxCharacters).toBe(DEFAULT_CHARS);
    expect(opts.highlights.query).toBe("did it happen?");
  });

  it("maps the page to a FetchedSource carrying its outbound links", async () => {
    withPage({
      url: "https://wire.com/story",
      title: "Wire report",
      text: "the body",
      highlights: ["the excerpt"],
      publishedDate: "2026-02-22T10:00:00Z",
      extras: { links: ["https://origin.gov/statement", "https://x.com/share"] },
    });
    const page = await createExaFetch()("https://wire.com/story");
    expect(page.domain).toBe("wire.com");
    expect(page.passage).toBe("the excerpt");
    expect(page.publishedDate).toBe("2026-02-22");
    expect(page.links).toEqual(["https://origin.gov/statement", "https://x.com/share"]);
  });

  it("defaults links to an empty frontier when Exa returns none", async () => {
    withPage({ url: "https://a.com/1", title: "T", text: "body" });
    const page = await createExaFetch()("https://a.com/1");
    expect(page.links).toEqual([]);
  });

  it("throws when Exa returns no contents for the URL", async () => {
    getContentsMock.mockResolvedValue({ results: [] });
    await expect(createExaFetch()("https://a.com/1")).rejects.toThrow(/no contents/);
  });

  it("throws a clear error when no Exa key is present", () => {
    delete process.env.EXA_API_KEY;
    expect(() => createExaFetch()).toThrow(/EXA_API_KEY/);
  });
});
