import { describe, it, expect, vi, beforeEach } from "vitest";

// Capture the options passed to Exa.search (and the constructor key) so we can assert
// de-novo exclusion and per-request key resolution.
const searchMock = vi.fn();
const ctorMock = vi.fn();

vi.mock("exa-js", () => {
  return {
    default: class FakeExa {
      search = searchMock;
      constructor(key: string) {
        ctorMock(key);
      }
    },
  };
});

import { createExaSearch, FACT_CHECKERS } from "./exa";

beforeEach(() => {
  searchMock.mockReset();
  ctorMock.mockReset();
  process.env.EXA_API_KEY = "env-key";
});

function withResults(results: unknown[]) {
  searchMock.mockResolvedValue({ results });
}

const search = () => createExaSearch();

describe("createExaSearch — de-novo retrieval", () => {
  it("excludes every fact-check outlet from the search (the honesty bar)", async () => {
    withResults([]);
    await search()("did X happen?");
    const opts = searchMock.mock.calls[0][1];
    expect(opts.excludeDomains).toEqual(FACT_CHECKERS);
  });

  it("caps results for graph legibility and requests highlights+text", async () => {
    withResults([]);
    await search()("did X happen?");
    const opts = searchMock.mock.calls[0][1];
    expect(opts.numResults).toBe(2);
    expect(opts.contents.highlights).toBe(true);
    expect(opts.contents.text.maxCharacters).toBe(800);
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

  it("prefers the first highlight as the passage", async () => {
    withResults([
      { url: "https://x.com", title: "T", highlights: ["the highlight"], text: "the full text" },
    ]);
    const [ev] = await search()("q");
    expect(ev.passage).toBe("the highlight");
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
    withResults([{ url: "https://x.com", title: "T", favicon: "https://x.com/fav.ico", highlights: ["h"] }]);
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
      { url: "https://x.com", title: "T", highlights: ["h"], publishedDate: "2026-02-22T14:26:00Z" },
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
    await createExaSearch("user-key")("q");
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
