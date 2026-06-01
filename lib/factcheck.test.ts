import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ratingToStance,
  factCheckEvidence,
  factCheckRationale,
  createFactCheckLookup,
  type FactCheckHit,
} from "./factcheck";

describe("ratingToStance", () => {
  it("maps clear falsy labels to refutes", () => {
    for (const r of ["False", "Pants on Fire!", "Incorrect", "Mostly False", "Fake", "Falso"]) {
      expect(ratingToStance(r)).toBe("refutes");
    }
  });

  it("maps clear truthy labels to supports", () => {
    for (const r of ["True", "Correct", "Mostly True", "Accurate", "Verdadero"]) {
      expect(ratingToStance(r)).toBe("supports");
    }
  });

  it("maps mixed/ambiguous labels to contextualizes", () => {
    for (const r of ["Half True", "Mixture", "Mixed", "Unrated", ""]) {
      expect(ratingToStance(r)).toBe("contextualizes");
    }
  });

  it("lets a negation win over an embedded truthy substring (not true ⇒ refutes)", () => {
    expect(ratingToStance("Not true")).toBe("refutes");
  });
});

function hit(over: Partial<FactCheckHit> = {}): FactCheckHit {
  return {
    claimText: "the claim",
    publisher: "Snopes",
    site: "snopes.com",
    url: "https://snopes.com/fact-check/x",
    title: "Fact check: X",
    reviewDate: "2024-01-02",
    textualRating: "False",
    stance: "refutes",
    trusted: true,
    ...over,
  };
}

describe("factCheckEvidence", () => {
  it("attaches evidence to the synthetic question and never marks a fact-check primary", () => {
    const ev = factCheckEvidence([hit()], "c1-fc");
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      id: "c1-fc-e1",
      questionId: "c1-fc",
      domain: "snopes.com",
      stance: "refutes",
      reliability: "high", // trusted (curated FACT_CHECKERS outlet)
      sourceType: "secondary", // a finished fact-check is never primary
    });
    expect(ev[0].stanceConfidence).toBeGreaterThanOrEqual(0.5); // clear stance ⇒ deciding
  });

  it("downgrades an untrusted publisher to medium reliability", () => {
    const ev = factCheckEvidence([hit({ trusted: false, site: "randomblog.example" })], "c1-fc");
    expect(ev[0].reliability).toBe("medium");
  });

  it("keeps an ambiguous (contextualizing) rating below the deciding confidence bar", () => {
    const ev = factCheckEvidence(
      [hit({ stance: "contextualizes", textualRating: "Mixture" })],
      "c1-fc",
    );
    expect(ev[0].stanceConfidence).toBeLessThan(0.5);
  });
});

describe("factCheckRationale", () => {
  it("names the adjudicating publisher and signals the short-circuit", () => {
    const r = factCheckRationale("refuted", [hit()]);
    expect(r).toMatch(/Snopes/);
    expect(r).toMatch(/short-circuit/i);
  });
});

describe("createFactCheckLookup", () => {
  const realFetch = globalThis.fetch;
  const realEnv = process.env.GOOGLE_FACT_CHECK_API_KEY;

  beforeEach(() => {
    delete process.env.GOOGLE_FACT_CHECK_API_KEY;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    if (realEnv === undefined) delete process.env.GOOGLE_FACT_CHECK_API_KEY;
    else process.env.GOOGLE_FACT_CHECK_API_KEY = realEnv;
  });

  it("throws synchronously when no key is available (so the route can 400)", () => {
    expect(() => createFactCheckLookup({})).toThrow(/GOOGLE_FACT_CHECK_API_KEY/);
  });

  it("normalizes the API response into stance-mapped hits", async () => {
    const json = {
      claims: [
        {
          text: "Vaccines cause X",
          claimant: "viral post",
          claimReview: [
            {
              publisher: { name: "PolitiFact", site: "politifact.com" },
              url: "https://politifact.com/factchecks/abc",
              title: "No evidence vaccines cause X",
              reviewDate: "2023-05-01T00:00:00Z",
              textualRating: "False",
              languageCode: "en",
            },
          ],
        },
      ],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => json,
    }) as unknown as typeof fetch;

    const lookup = createFactCheckLookup({ apiKey: "k" });
    const hits = await lookup("Vaccines cause X");
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({
      publisher: "PolitiFact",
      site: "politifact.com",
      stance: "refutes",
      trusted: true,
      reviewDate: "2023-05-01",
    });
  });

  it("throws on a non-ok response (caller treats it as no fact-check)", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 429 }) as unknown as typeof fetch;
    const lookup = createFactCheckLookup({ apiKey: "k" });
    await expect(lookup("q")).rejects.toThrow(/429/);
  });

  it("skips reviews lacking a url or rating", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ claims: [{ text: "c", claimReview: [{ publisher: { name: "X" } }] }] }),
    }) as unknown as typeof fetch;
    const lookup = createFactCheckLookup({ apiKey: "k" });
    expect(await lookup("q")).toEqual([]);
  });
});
