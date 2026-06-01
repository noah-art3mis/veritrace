import { describe, it, expect } from "vitest";
import { claimVerdict, isDeciding, sourceVerdict, tallyClaims } from "./verdict";
import type { ClaimItem, EvidenceItem, Stance, Verdict } from "../graph-types";

// Verdict aggregation is the one piece of "judgement" VERITRACE states rather than
// learns (PLAN.md). These tests pin the inspectable rule so it can't silently drift.

function claim(over: Partial<ClaimItem> = {}): ClaimItem {
  return { id: "c1", text: "a claim", checkable: true, verdict: null, ...over };
}

let evId = 0;
function evidence(
  stance: Stance,
  stanceConfidence: number,
  sourceType: EvidenceItem["sourceType"] = "primary",
): EvidenceItem {
  return {
    id: `e${evId++}`,
    questionId: "q1",
    title: "t",
    url: "https://example.com/x",
    domain: "example.com",
    passage: "p",
    stance,
    reliability: "high",
    sourceType,
    stanceConfidence,
  };
}

describe("claimVerdict", () => {
  it("returns nei for an unckeckable claim regardless of evidence", () => {
    const c = claim({ checkable: false });
    // Even strong supporting evidence cannot move an unverifiable-by-text claim.
    expect(claimVerdict(c, [evidence("supports", 0.99)])).toBe("nei");
  });

  it("returns nei for a non-checkworthy (opinion) claim regardless of evidence", () => {
    const c = claim({ checkworthy: false });
    expect(claimVerdict(c, [evidence("supports", 0.99)])).toBe("nei");
  });

  it("returns nei for a relevance-dropped claim regardless of evidence", () => {
    // A trivial background claim the relevance filter dropped is never given a real verdict.
    const c = claim({ relevant: false });
    expect(claimVerdict(c, [evidence("supports", 0.99)])).toBe("nei");
  });

  it("returns supported when only confident supporting evidence exists", () => {
    expect(claimVerdict(claim(), [evidence("supports", 0.8)])).toBe("supported");
  });

  it("returns refuted when only confident refuting evidence exists", () => {
    expect(claimVerdict(claim(), [evidence("refutes", 0.8)])).toBe("refuted");
  });

  it("returns nei (inconclusive), not conflicting, when support AND refutation coexist (ADR 0007)", () => {
    // A single atomic claim with deciding evidence both ways is inconclusive — the ivermectin /
    // border-barriers case. Cherrypicking (`conflicting`) is a document-level property only.
    const ev = [evidence("supports", 0.8), evidence("refutes", 0.8)];
    expect(claimVerdict(claim(), ev)).toBe("nei");
  });

  it("returns nei when only contextual evidence is present", () => {
    expect(claimVerdict(claim(), [evidence("contextualizes", 0.9)])).toBe("nei");
  });

  it("returns nei when there is no evidence at all", () => {
    expect(claimVerdict(claim(), [])).toBe("nei");
  });

  it("ignores evidence below the 0.5 confidence floor", () => {
    // A 0.49 supporting passage is too weak to move the verdict off nei.
    expect(claimVerdict(claim(), [evidence("supports", 0.49)])).toBe("nei");
  });

  it("counts evidence exactly at the 0.5 confidence floor", () => {
    expect(claimVerdict(claim(), [evidence("supports", 0.5)])).toBe("supported");
  });

  it("treats missing stanceConfidence as below the floor", () => {
    const e = evidence("supports", 0.9);
    delete e.stanceConfidence;
    expect(claimVerdict(claim(), [e])).toBe("nei");
  });

  it("does not let a weak refutation flip a confident support to conflicting", () => {
    const ev = [evidence("supports", 0.9), evidence("refutes", 0.3)];
    expect(claimVerdict(claim(), ev)).toBe("supported");
  });

  // Echo-chamber guard (#51): reliable re-reporting that never reaches an originating source
  // cannot establish a verdict. The Santander-scam miss had only supports/secondary evidence and
  // was wrongly predicted "supported"; it must abstain to NEI.
  it("abstains to nei when all deciding evidence is secondary re-reporting (no primary)", () => {
    const ev = [evidence("supports", 0.9, "secondary"), evidence("supports", 0.8, "secondary")];
    expect(claimVerdict(claim(), ev)).toBe("nei");
  });

  it("abstains to nei when only secondary refutation exists (no primary)", () => {
    expect(claimVerdict(claim(), [evidence("refutes", 0.9, "secondary")])).toBe("nei");
  });

  it("decides normally once at least one deciding source is primary", () => {
    const ev = [evidence("supports", 0.9, "secondary"), evidence("supports", 0.8, "primary")];
    expect(claimVerdict(claim(), ev)).toBe("supported");
  });

  it("treats an opinion-typed deciding source as non-primary (still abstains)", () => {
    expect(claimVerdict(claim(), [evidence("supports", 0.9, "opinion")])).toBe("nei");
  });

  // A contextualizing source takes no side, so it cannot be the primary that satisfies the
  // echo-chamber guard. Here the only primary merely contextualizes and the support is all
  // secondary re-reporting — that's exactly the de-novo gap the guard exists to abstain on.
  it("a contextualizing primary does not satisfy the primary-source guard", () => {
    const ev = [evidence("contextualizes", 0.9, "primary"), evidence("supports", 0.9, "secondary")];
    expect(claimVerdict(claim(), ev)).toBe("nei");
  });
});

describe("isDeciding — only a committal, reliable, confident source can move a verdict", () => {
  it("excludes contextualizing evidence even when reliable and confident", () => {
    // Contextual background neither supports nor refutes, so it must not read as decision-grade
    // (it must not earn the deciding star nor count toward the primary guard).
    expect(isDeciding(evidence("contextualizes", 0.95))).toBe(false);
  });

  it("includes a confident, reliable, committal source", () => {
    expect(isDeciding(evidence("supports", 0.8))).toBe(true);
    expect(isDeciding(evidence("refutes", 0.8))).toBe(true);
  });
});

describe("sourceVerdict (relevance-weighted, ADR 0007)", () => {
  // Sugar: build weighted entries; relevanceScore defaults to 1 (equal weight) when omitted.
  const v = (verdict: Verdict, relevanceScore = 1) => ({ verdict, relevanceScore });

  it("returns nei when every claim is nei", () => {
    expect(sourceVerdict([v("nei"), v("nei")])).toBe("nei");
  });

  it("returns nei for an empty claim set", () => {
    expect(sourceVerdict([])).toBe("nei");
  });

  it("excludes nei claims rather than letting them dominate", () => {
    // One unverifiable fragment must not sink an otherwise-supported document.
    expect(sourceVerdict([v("supported"), v("nei")])).toBe("supported");
  });

  it("returns supported when all resolved claims are supported", () => {
    expect(sourceVerdict([v("supported"), v("supported")])).toBe("supported");
  });

  it("returns refuted when all resolved claims are refuted", () => {
    expect(sourceVerdict([v("refuted"), v("refuted")])).toBe("refuted");
  });

  it("surfaces a balanced supported+refuted document as conflicting (the El Mencho hero case)", () => {
    // Both sides equally load-bearing → genuine cherrypicking.
    expect(sourceVerdict([v("supported", 0.8), v("refuted", 0.8), v("nei")])).toBe("conflicting");
  });

  it("treats sides within the conflict ratio as cherrypicking", () => {
    // minority 0.5 ≥ 0.5 × majority 1.0 → both sides count → conflicting.
    expect(sourceVerdict([v("supported", 1.0), v("refuted", 0.5)])).toBe("conflicting");
  });

  it("does not let a lone low-relevance refuted claim flip a load-bearing supported document", () => {
    // minority 0.3 < 0.5 × majority 1.0 → lopsided → the settled central claim wins (#53).
    expect(sourceVerdict([v("supported", 1.0), v("refuted", 0.3)])).toBe("supported");
  });

  it("symmetric: a lone low-relevance supported claim does not flip a refuted document", () => {
    expect(sourceVerdict([v("refuted", 1.0), v("supported", 0.3)])).toBe("refuted");
  });

  it("defaults missing relevance to equal weight (any support + any refute → conflicting)", () => {
    expect(sourceVerdict([{ verdict: "supported" }, { verdict: "refuted" }])).toBe("conflicting");
  });
});

describe("tallyClaims", () => {
  it("counts each verdict and the total (the support ratio behind 'X of N supported')", () => {
    expect(tallyClaims(["supported", "supported", "refuted", "nei"])).toEqual({
      supported: 2,
      refuted: 1,
      conflicting: 0,
      nei: 1,
      total: 4,
      dropped: 0,
    });
  });

  it("carries the relevance-dropped count without inflating the checked total", () => {
    const tally = tallyClaims(["supported", "refuted"], 3);
    expect(tally.total).toBe(2);
    expect(tally.dropped).toBe(3);
  });

  it("returns an all-zero tally for an empty claim set", () => {
    expect(tallyClaims([])).toEqual({
      supported: 0,
      refuted: 0,
      conflicting: 0,
      nei: 0,
      total: 0,
      dropped: 0,
    });
  });
});
