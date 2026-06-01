import { describe, it, expect } from "vitest";
import { domainCredibility } from "./domain-credibility";

describe("domainCredibility", () => {
  it("rates an international wire as high", () => {
    expect(domainCredibility("reuters.com")).toBe("high");
    expect(domainCredibility("apnews.com")).toBe("high");
  });

  it("resolves a subdomain to its registrable domain", () => {
    expect(domainCredibility("mundo.bbc.com")).toBe("high");
    expect(domainCredibility("en.wikipedia.org")).toBe("high");
  });

  it("is case-insensitive and strips a leading www.", () => {
    expect(domainCredibility("WWW.Reuters.com")).toBe("high");
  });

  it("rates consensus low-credibility outlets and raw platforms as low", () => {
    expect(domainCredibility("infowars.com")).toBe("low");
    expect(domainCredibility("x.com")).toBe("low");
    expect(domainCredibility("youtube.com")).toBe("low");
  });

  it("rates a solid secondary outlet as medium", () => {
    expect(domainCredibility("businessinsider.com")).toBe("medium");
  });

  it("treats government / military TLDs as high, including localised second-levels", () => {
    expect(domainCredibility("whitehouse.gov")).toBe("high");
    expect(domainCredibility("nhs.gov.uk")).toBe("high");
    expect(domainCredibility("www.gob.mx")).toBe("high");
    expect(domainCredibility("defense.gov")).toBe("high");
  });

  it("returns undefined for an unknown domain so the caller falls back to the model", () => {
    expect(domainCredibility("some-random-blog.example")).toBeUndefined();
    expect(domainCredibility("personal.substack.com")).toBeUndefined();
  });

  it("does not mistake a domain that merely contains a known name as a match", () => {
    // endsWith on a dot-boundary, not a substring — notbbc.com must not match bbc.com.
    expect(domainCredibility("notbbc.com")).toBeUndefined();
    expect(domainCredibility("reuters.com.fake-aggregator.net")).toBeUndefined();
  });
});
