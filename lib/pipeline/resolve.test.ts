import { describe, it, expect, vi } from "vitest";
import {
  rationaleFor,
  dateWindow,
  resolveQuestion,
  rankAndCapEvidence,
  dropClaimEchoes,
} from "./resolve";
import { claimVerdict } from "./verdict";
import type { ClaimItem, EvidenceItem, QuestionItem, Stance } from "../graph-types";
import type { RawEvidence } from "../exa";
import type { ToolLoopOpts } from "../reasoner-types";
import type { PipelineDeps } from "./deps";

function claim(over: Partial<ClaimItem> = {}): ClaimItem {
  return { id: "c1", text: "a claim", checkable: true, verdict: null, ...over };
}

let evId = 0;
function evidence(
  stance: Stance,
  domain: string,
  reliability: EvidenceItem["reliability"] = "high",
  sourceType: EvidenceItem["sourceType"] = "primary",
): EvidenceItem {
  return {
    id: `e${evId++}`,
    questionId: "q1",
    title: "t",
    url: `https://${domain}/x`,
    domain,
    passage: "p",
    stance,
    reliability,
    sourceType,
    stanceConfidence: 0.9,
  };
}

describe("dropClaimEchoes", () => {
  const CLAIM = "Armed CJNG members seized Guadalajara International Airport on 22 February 2026";
  let n = 0;
  function rawEv(passage: string, over: Partial<RawEvidence> = {}): RawEvidence {
    return {
      title: "t",
      url: `https://ex.com/${n++}`,
      domain: "ex.com",
      passage,
      text: passage,
      ...over,
    };
  }

  it("drops a passage that is a verbatim restatement of the claim", () => {
    const kept = dropClaimEchoes(CLAIM, [rawEv(CLAIM)]);
    expect(kept).toHaveLength(0);
  });

  it("drops a near-verbatim echo differing only in case and punctuation", () => {
    const echo = "armed cjng members seized guadalajara international airport on 22 february 2026.";
    expect(dropClaimEchoes(CLAIM, [rawEv(echo)])).toHaveLength(0);
  });

  it("keeps a short passage that quotes the claim and then refutes it", () => {
    // Same words as the claim plus a verification cue — this is doing the work, not echoing.
    const refute = `${CLAIM}. This is false; officials denied any airport seizure.`;
    expect(dropClaimEchoes(CLAIM, [rawEv(refute)])).toHaveLength(1);
  });

  it("keeps a long article that merely contains the claim among other reporting", () => {
    const article =
      `Security across Mexican airports was reviewed this month. ${CLAIM}, according to a viral post. ` +
      "However, the federal aviation authority's logs, airline statements, and on-site reporters all " +
      "described normal operations throughout the period, with no evacuation, no hostages, and no closure.";
    expect(dropClaimEchoes(CLAIM, [rawEv(article)])).toHaveLength(1);
  });

  it("keeps genuinely independent evidence with low overlap", () => {
    const indep = rawEv("Federal police reported routine patrols at the terminal that week.");
    expect(dropClaimEchoes(CLAIM, [indep])).toEqual([indep]);
  });

  it("keeps everything when the claim text is empty (nothing to compare)", () => {
    const items = [rawEv("anything at all")];
    expect(dropClaimEchoes("", items)).toEqual(items);
  });

  it("removes only the echoes and preserves the order of the rest", () => {
    const a = rawEv("Independent reporting on terminal security staffing levels.");
    const echo = rawEv(CLAIM);
    const b = rawEv("A separate dispatch about regional cartel movements that month.");
    expect(dropClaimEchoes(CLAIM, [a, echo, b])).toEqual([a, b]);
  });
});

describe("rationaleFor", () => {
  it("explains an unckeckable claim by its media-provenance limit, ignoring verdict", () => {
    const text = rationaleFor(claim({ checkable: false }), "nei", []);
    expect(text).toMatch(/imagery or media provenance/i);
  });

  it("explains an opinion/non-checkworthy claim as not a checkable assertion", () => {
    const text = rationaleFor(claim({ checkworthy: false }), "nei", []);
    expect(text).toMatch(/subjective or opinion/i);
  });

  it("explains nei with no evidence by saying no sources answered the questions", () => {
    expect(rationaleFor(claim(), "nei", [])).toMatch(/no primary sources answered/i);
  });

  it("explains nei with weak evidence by naming the sources that missed the bar", () => {
    // Low-reliability sources were found but none could move the verdict.
    const ev = [
      evidence("supports", "blog.example", "low"),
      evidence("contextualizes", "aggregator.test", "low"),
    ];
    const text = rationaleFor(claim(), "nei", ev);
    expect(text).toMatch(/found 2 sources/i);
    expect(text).toContain("blog.example");
    expect(text).toMatch(/none cleared the reliability/i);
  });

  it("explains an echo-chamber nei: reliable sources found, but all re-reporting (no primary)", () => {
    // #51: high-reliability supports, but every source is secondary re-reporting → the rationale
    // must name re-reporting / no originating source, not "none cleared the reliability bar".
    const ev = [
      evidence("supports", "reuters.com", "high", "secondary"),
      evidence("supports", "ap.org", "high", "secondary"),
    ];
    const text = rationaleFor(claim(), "nei", ev);
    expect(text).toMatch(/re-reporting/i);
    expect(text).toMatch(/no primary|originating source/i);
    expect(text).not.toMatch(/none cleared the reliability/i);
  });

  it("names the supporting domains for a supported verdict and flags a primary source", () => {
    const ev = [evidence("supports", "bbc.com"), evidence("supports", "reuters.com")];
    expect(rationaleFor(claim(), "supported", ev)).toBe(
      "Supported by bbc.com and reuters.com — incl. a primary source.",
    );
  });

  it("flags re-reporting when no deciding source is a primary", () => {
    const ev = [evidence("supports", "bbc.com", "high", "secondary")];
    expect(rationaleFor(claim(), "supported", ev)).toBe(
      "Supported by bbc.com — re-reporting only, no originating source located.",
    );
  });

  it("uses only refuting domains when composing a refuted rationale", () => {
    const ev = [evidence("supports", "blog.example"), evidence("refutes", "proceso.com.mx")];
    const text = rationaleFor(claim(), "refuted", ev);
    expect(text).toContain("proceso.com.mx");
    // The deciding evidence for a refutation is the refuting source, not the stray support.
    expect(text).not.toContain("blog.example");
  });

  it("deduplicates repeated domains in the rationale", () => {
    const ev = [evidence("supports", "bbc.com"), evidence("supports", "bbc.com")];
    expect(rationaleFor(claim(), "supported", ev)).toBe(
      "Supported by bbc.com — incl. a primary source.",
    );
  });

  it("summarizes three-plus domains as 'a, b and others'", () => {
    const ev = [
      evidence("supports", "a.com"),
      evidence("supports", "b.com"),
      evidence("supports", "c.com"),
    ];
    expect(rationaleFor(claim(), "supported", ev)).toBe(
      "Supported by a.com, b.com and others — incl. a primary source.",
    );
  });

  it("considers both stances as deciding for a conflicting verdict", () => {
    const ev = [evidence("supports", "bbc.com"), evidence("refutes", "cnn.com")];
    const text = rationaleFor(claim(), "conflicting", ev);
    expect(text).toContain("bbc.com");
    expect(text).toContain("cnn.com");
    expect(text).toMatch(/conflict/i);
  });

  it("falls back to a generic phrase when the deciding set has no domains", () => {
    // supported verdict but no supporting evidence present → no domains, no primary to flag.
    const text = rationaleFor(claim(), "supported", [evidence("refutes", "x.com")]);
    expect(text).toBe(
      "Supported by the retrieved sources — re-reporting only, no originating source located.",
    );
  });
});

describe("rankAndCapEvidence", () => {
  it("caps to the limit, keeping the highest-value items first", () => {
    const ev = [
      evidence("contextualizes", "blog.test", "low", "secondary"),
      evidence("supports", "reuters.com", "high", "primary"),
      evidence("supports", "regional.test", "medium", "secondary"),
    ];
    const out = rankAndCapEvidence(ev, 2);
    expect(out).toHaveLength(2);
    // The high-reliability primary outranks the low-reliability contextual filler, which is dropped.
    expect(out.map((e) => e.domain)).toContain("reuters.com");
    expect(out.map((e) => e.domain)).not.toContain("blog.test");
  });

  it("returns everything unchanged when already under the limit", () => {
    const ev = [evidence("supports", "a.com"), evidence("refutes", "b.com")];
    expect(rankAndCapEvidence(ev, 6)).toHaveLength(2);
  });

  it("preserves the verdict across the cap by keeping the top deciding support and refute", () => {
    // 8 deciding supports would crowd out the lone refute on a naive top-N slice, flipping the
    // claim's verdict from NEI (mixed evidence is inconclusive — ADR 0007) to a false Supported.
    // The cap must retain the deciding refute so the verdict is preserved.
    const supports = Array.from({ length: 8 }, (_, i) =>
      evidence("supports", `s${i}.com`, "high", "primary"),
    );
    const refute = evidence("refutes", "denial.gov", "high", "primary");
    const full = [...supports, refute];
    const capped = rankAndCapEvidence(full, 4);
    expect(capped).toHaveLength(4);
    expect(capped.some((e) => e.stance === "refutes")).toBe(true);
    // Verdict on the capped set matches the verdict on the full set — NEI, not a false Supported.
    expect(claimVerdict(claim(), capped)).toBe(claimVerdict(claim(), full));
    expect(claimVerdict(claim(), capped)).toBe("nei");
  });
});

describe("dateWindow", () => {
  it("returns undefined when no date is known (current open-ended behavior)", () => {
    expect(dateWindow(undefined)).toBeUndefined();
  });

  it("returns undefined for an unparseable date rather than a bogus window", () => {
    expect(dateWindow("not-a-date")).toBeUndefined();
  });

  it("centers a window 30 days before and 14 days after the event date", () => {
    expect(dateWindow("2026-02-22")).toEqual({
      startPublishedDate: "2026-01-23",
      endPublishedDate: "2026-03-08",
    });
  });
});

describe("resolveQuestion (agentic gather loop)", () => {
  const question: QuestionItem = {
    id: "c1-q1",
    claimId: "c1",
    text: "did X happen?",
    status: "searching",
  };

  function rawSource(domain: string): RawEvidence {
    return { title: "t", url: `https://${domain}/x`, domain, passage: "p", text: "p" };
  }

  // askWithTools is the model: we script which queries it issues via opts.onTool.
  function fakeModel(queries: string[]) {
    return vi.fn(async (_prompt: string, opts: ToolLoopOpts) => {
      for (const q of queries) await opts.onTool("search_evidence", { query: q });
      return { text: "done", toolCalls: [], steps: queries.length };
    });
  }

  function deps(over: Partial<PipelineDeps> = {}, queries = ["model query 1"]): PipelineDeps {
    return {
      ask: {
        askText: vi.fn().mockResolvedValue("A neutral hypothetical report."),
        askJSON: vi.fn().mockResolvedValue([]),
        askWithTools: fakeModel(queries),
      },
      search: vi.fn().mockResolvedValue([]),
      maxClaims: 5,
      maxQuestions: 2,
      ...over,
    };
  }

  it("seeds the loop with a HyDE-expanded query (question text + hypothetical)", async () => {
    const d = deps();
    await resolveQuestion(claim({ date: "2026-02-22" }), question, d);
    const prompt = (d.ask.askWithTools as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(prompt).toContain("did X happen?");
    expect(prompt).toContain("neutral hypothetical");
  });

  it("runs each of the model's searches inside the claim's centered date window", async () => {
    const d = deps();
    await resolveQuestion(claim({ date: "2026-02-22" }), question, d);
    expect(d.search).toHaveBeenCalledWith("model query 1", {
      startPublishedDate: "2026-01-23",
      endPublishedDate: "2026-03-08",
      highlightQuery: question.text,
    });
  });

  it("searches with no date window but still focuses highlights when the claim has no date", async () => {
    const d = deps();
    await resolveQuestion(claim(), question, d);
    expect(d.search).toHaveBeenCalledWith("model query 1", { highlightQuery: question.text });
  });

  it("accumulates and dedupes evidence by url across the model's searches", async () => {
    const search = vi.fn(async (q: string) =>
      q === "q1"
        ? [rawSource("a.com"), rawSource("b.com")]
        : [rawSource("b.com"), rawSource("c.com")],
    );
    // classify zips one stance per source positionally; 3 unique sources → 3 classifications.
    const askJSON = vi.fn().mockResolvedValue(
      Array.from({ length: 3 }, () => ({
        stance: "supports",
        reliability: "high",
        sourceType: "primary",
        stanceConfidence: 0.9,
      })),
    );
    const d = deps(
      {
        search,
        ask: {
          askText: vi.fn().mockResolvedValue("h"),
          askJSON,
          askWithTools: fakeModel(["q1", "q2"]),
        },
      },
      ["q1", "q2"],
    );

    const out = await resolveQuestion(claim(), question, d);
    // 2 RRF directional seed searches (question + 1 anchor) + the model's 2 follow-ups (#56).
    expect(search).toHaveBeenCalledTimes(4);
    // Results across all queries collapse to 3 unique evidence items (deduped by url).
    expect(out.evidence.map((e) => e.domain).sort()).toEqual(["a.com", "b.com", "c.com"]);
  });

  it("survives a search failure: degrades that query but keeps the loop and run alive", async () => {
    // A transient Exa timeout on one query must NOT abort the gather loop (and via Promise.race,
    // the whole run). The model gets an error result and the question resolves on what's left.
    const search = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" }));
    const d = deps({ search }, ["q1", "q2"]);
    const out = await resolveQuestion(claim(), question, d);
    expect(out.evidence).toEqual([]);
    // Seed searches AND the model's follow-ups are all attempted; no failure aborts the loop.
    expect(search).toHaveBeenCalledTimes(4);
    expect(out.trace.searchQueries).toEqual(expect.arrayContaining(["q1", "q2"]));
  });

  it("returns a trace: HyDE hypothetical, the executed queries, and the gather summary", async () => {
    const d = deps(
      {
        ask: {
          askText: vi.fn().mockResolvedValue("A neutral hypothetical report."),
          askJSON: vi.fn().mockResolvedValue([]),
          askWithTools: fakeModel(["q1", "q2"]),
        },
      },
      ["q1", "q2"],
    );
    const out = await resolveQuestion(claim(), question, d);
    // expandQuery now labels the directional anchor(s); the passage text is still carried through.
    expect(out.trace.hydePassage).toContain("A neutral hypothetical report.");
    // searchQueries now records the RRF seed queries (question + anchors) plus the model's queries.
    expect(out.trace.searchQueries).toEqual(expect.arrayContaining(["q1", "q2"]));
    expect(out.trace.gatherSummary).toBe("done");
  });
});
