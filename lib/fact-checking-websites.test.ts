import { describe, it, expect } from "vitest";
import {
  isFactCheckingWebsite,
  FACT_CHECKING_WEBSITES,
  FactCheckingWebsite,
} from "./fact-checking-websites";

describe("isFactCheckingWebsite", () => {
  it("matches a bare known domain", () => {
    expect(isFactCheckingWebsite("snopes.com")).toBe(true);
    expect(isFactCheckingWebsite("politifact.com")).toBe(true);
  });

  it("matches a full URL, ignoring scheme / www / path", () => {
    expect(isFactCheckingWebsite("https://www.factcheck.org/2024/01/some-claim/")).toBe(true);
    expect(isFactCheckingWebsite("http://AFRICACHECK.ORG/reports/x")).toBe(true);
  });

  it("matches subdomains of a known fact-checker", () => {
    expect(isFactCheckingWebsite("api.snopes.com")).toBe(true);
    expect(isFactCheckingWebsite("https://amp.boomlive.in/news")).toBe(true);
  });

  it("rejects unknown / general-news domains", () => {
    expect(isFactCheckingWebsite("nytimes.com")).toBe(false);
    expect(isFactCheckingWebsite("https://example.com")).toBe(false);
    expect(isFactCheckingWebsite("")).toBe(false);
  });

  it("does not false-match a domain that merely contains a known one as a substring", () => {
    expect(isFactCheckingWebsite("notsnopes.com")).toBe(false);
    expect(isFactCheckingWebsite("snopes.com.evil.example")).toBe(false);
  });
});

describe("FACT_CHECKING_WEBSITES roster", () => {
  it("has unique, normalized (lowercase, no www, no scheme) domains", () => {
    const domains = FACT_CHECKING_WEBSITES.map((w: FactCheckingWebsite) => w.domain);
    expect(new Set(domains).size).toBe(domains.length);
    for (const d of domains) {
      expect(d).toBe(d.toLowerCase());
      expect(d).not.toMatch(/^www\.|:\/\//);
    }
  });

  it("carries a name and region for every entry", () => {
    for (const w of FACT_CHECKING_WEBSITES) {
      expect(w.name.length).toBeGreaterThan(0);
      expect(w.region.length).toBeGreaterThan(0);
    }
  });
});
