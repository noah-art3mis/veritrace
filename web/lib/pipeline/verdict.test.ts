import { describe, it, expect } from "vitest";
import { claimVerdict, sourceVerdict, tallyClaims } from "./verdict";
import type { ClaimItem, EvidenceItem, Stance, Verdict } from "../graph-types";

// Verdict aggregation is the one piece of "judgement" VERITRACE states rather than
// learns (PLAN.md). These tests pin the inspectable rule so it can't silently drift.

function claim(over: Partial<ClaimItem> = {}): ClaimItem {
  return { id: "c1", text: "a claim", checkable: true, verdict: null, ...over };
}

let evId = 0;
function evidence(stance: Stance, stanceConfidence: number): EvidenceItem {
  return {
    id: `e${evId++}`,
    questionId: "q1",
    title: "t",
    url: "https://example.com/x",
    domain: "example.com",
    passage: "p",
    stance,
    reliability: "high",
    sourceType: "primary",
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

  it("returns supported when only confident supporting evidence exists", () => {
    expect(claimVerdict(claim(), [evidence("supports", 0.8)])).toBe("supported");
  });

  it("returns refuted when only confident refuting evidence exists", () => {
    expect(claimVerdict(claim(), [evidence("refutes", 0.8)])).toBe("refuted");
  });

  it("returns conflicting when confident support AND refutation coexist", () => {
    const ev = [evidence("supports", 0.8), evidence("refutes", 0.8)];
    expect(claimVerdict(claim(), ev)).toBe("conflicting");
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
});

describe("sourceVerdict", () => {
  it("returns nei when every claim is nei", () => {
    expect(sourceVerdict(["nei", "nei"])).toBe("nei");
  });

  it("returns nei for an empty claim set", () => {
    expect(sourceVerdict([])).toBe("nei");
  });

  it("excludes nei claims rather than letting them dominate", () => {
    // One unverifiable fragment must not sink an otherwise-supported document.
    expect(sourceVerdict(["supported", "nei"])).toBe("supported");
  });

  it("returns supported when all resolved claims are supported", () => {
    expect(sourceVerdict(["supported", "supported"])).toBe("supported");
  });

  it("returns refuted when all resolved claims are refuted", () => {
    expect(sourceVerdict(["refuted", "refuted"])).toBe("refuted");
  });

  it("surfaces a mixed supported+refuted document as conflicting (the El Mencho hero case)", () => {
    expect(sourceVerdict(["supported", "refuted", "nei"])).toBe("conflicting");
  });

  it("propagates a single conflicting claim to the document level", () => {
    expect(sourceVerdict(["supported", "conflicting"])).toBe("conflicting");
  });

  it("returns conflicting when a lone conflicting claim is the only resolved one", () => {
    expect(sourceVerdict(["nei", "conflicting"])).toBe("conflicting");
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
    });
  });

  it("returns an all-zero tally for an empty claim set", () => {
    expect(tallyClaims([])).toEqual({ supported: 0, refuted: 0, conflicting: 0, nei: 0, total: 0 });
  });
});
