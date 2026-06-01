// Verifies the AVeriTeC + X-Fact → GoldenClaim importers: label normalisation, evidence
// flattening, date coercion, and org derivation. Pure-function tests on inline fixtures —
// no dataset download needed, runs in the existing `npm test`.

import { describe, it, expect } from "vitest";
import {
  fromAveritec,
  fromXfactRow,
  toISODate,
  orgFromHost,
  hostOf,
  unwrapArchive,
} from "./convert.mjs";

/** Importers return `GoldenClaim | null` (null = skip). Assert present, then narrow. */
function present<T>(v: T | null): T {
  expect(v).not.toBeNull();
  return v as T;
}

describe("fromAveritec", () => {
  const rec = {
    claim: "The unemployment rate fell to 3% in 2022.",
    label: "Refuted",
    justification: "Official figures put it higher.",
    claim_date: "25-5-2022",
    speaker: "A politician",
    fact_checking_article: "https://www.snopes.com/fact-check/unemployment/",
    claim_types: ["Numerical Claim"],
    questions: [
      {
        question: "What was the 2022 unemployment rate?",
        answers: [
          { answer: "3.6%", source_url: "https://bls.gov/data" },
          { answer: "3.6%", source_url: "https://bls.gov/data" }, // dup → collapsed
        ],
      },
    ],
  };

  it("maps the four AVeriTeC labels onto our enum", () => {
    expect(present(fromAveritec({ ...rec, label: "Supported" })).gold.verdict).toBe("supported");
    expect(present(fromAveritec({ ...rec, label: "Refuted" })).gold.verdict).toBe("refuted");
    expect(
      present(fromAveritec({ ...rec, label: "Conflicting Evidence/Cherrypicking" })).gold.verdict,
    ).toBe("conflicting");
    expect(present(fromAveritec({ ...rec, label: "Not Enough Evidence" })).gold.verdict).toBe(
      "nei",
    );
  });

  it("derives org from the article host, keeps the raw rating, slugs claim types", () => {
    const g = present(fromAveritec(rec, { split: "dev", index: 7 }));
    expect(g.id).toBe("averitec-dev-00007");
    expect(g.source.org).toBe("snopes");
    expect(g.source.originalRating).toBe("Refuted");
    expect(g.source.benchmark).toBe("averitec");
    expect(g.tags).toEqual(["numerical-claim"]);
  });

  it("flattens + dedupes question evidence and coerces the date", () => {
    const g = present(fromAveritec(rec));
    expect(g.claimDate).toBe("2022-05-25");
    expect(g.gold.questions).toHaveLength(1);
    expect(g.gold.keyEvidenceUrls).toEqual(["https://bls.gov/data"]);
  });

  it("skips unlabelled records (the AVeriTeC test split)", () => {
    expect(fromAveritec({ ...rec, label: undefined })).toBeNull();
  });

  it("unwraps a Wayback-archived article so the org is the real publisher, not archive.org", () => {
    // The real AVeriTeC dev split wraps every fact_checking_article in a web.archive.org
    // snapshot. Without unwrapping, every record's org collapses to "web.archive.org" and the
    // --site snopes/fullfact filters never match.
    const archived = {
      ...rec,
      fact_checking_article:
        "https://web.archive.org/web/20201130144023/https://www.snopes.com/fact-check/unemployment/",
    };
    const g = present(fromAveritec(archived));
    expect(g.source.org).toBe("snopes");
    expect(g.source.url).toBe("https://www.snopes.com/fact-check/unemployment/");
  });
});

describe("fromXfactRow", () => {
  const header = ["language", "site", "evidence_1", "claimDate", "claimant", "claim", "label"];
  const idx: Record<string, number> = {};
  header.forEach((n, i) => (idx[n] = i));

  it("maps a Portuguese Aos Fatos row, pulling the evidence URL out of the snippet", () => {
    const cols = [
      "pt",
      "https://www.aosfatos.org",
      "context text https://gov.br/source more text",
      "2021-03-10",
      "Político",
      "Uma afirmação falsa.",
      "false",
    ];
    const g = present(fromXfactRow(cols, idx, { split: "eval", index: 7 }));
    expect(g.gold.verdict).toBe("refuted");
    expect(g.source.org).toBe("aosfatos");
    expect(g.source.language).toBe("pt");
    expect(g.gold.keyEvidenceUrls).toEqual(["https://gov.br/source"]);
    expect(g.id).toBe("xfact-pt-aosfatos-00007");
  });

  it("collapses half-true/misleading to conflicting and skips unmappable labels", () => {
    const mk = (label: string) => fromXfactRow(["pt", "x", "", "", "", "claim", label], idx, {});
    expect(present(mk("partly true/misleading")).gold.verdict).toBe("conflicting");
    expect(present(mk("other")).gold.verdict).toBe("nei");
    expect(mk("not-a-real-label")).toBeNull();
  });
});

describe("helpers", () => {
  it("normalises common date formats and drops ambiguous ones", () => {
    expect(toISODate("2022-05-25")).toBe("2022-05-25");
    expect(toISODate("25-5-2022")).toBe("2022-05-25");
    expect(toISODate("5/25/2022")).toBe("2022-05-25");
    expect(toISODate("sometime in 2022")).toBeUndefined();
  });

  it("strips www and slugs known orgs", () => {
    expect(hostOf("https://www.FullFact.org/x")).toBe("fullfact.org");
    expect(orgFromHost("fullfact.org")).toBe("fullfact");
    expect(orgFromHost("example.com")).toBe("example.com");
  });

  it("peels a Wayback wrapper and leaves bare URLs untouched", () => {
    expect(
      unwrapArchive("https://web.archive.org/web/20201130144023/https://www.snopes.com/x/"),
    ).toBe("https://www.snopes.com/x/");
    // Modifier suffix on the timestamp (e.g. im_, id_) must also be tolerated.
    expect(
      unwrapArchive("https://web.archive.org/web/20210629013122id_/https://fullfact.org/y"),
    ).toBe("https://fullfact.org/y");
    expect(unwrapArchive("https://www.snopes.com/already-bare/")).toBe(
      "https://www.snopes.com/already-bare/",
    );
  });
});
