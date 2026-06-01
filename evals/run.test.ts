// The harness core (runEval) takes an injected per-claim runner, so its mapping — pair each
// gold's verdict with the pipeline's document verdict, carry id/claim/tags through, coerce a
// missing verdict to null — is testable offline with a fake runner. The live wiring
// (collectGraph + real keys) lives in ./run.eval.test.ts.

import { describe, it, expect } from "vitest";
import { runEval } from "./run.mjs";

describe("runEval", () => {
  it("pairs each gold verdict with the document verdict, preserving id/claim/tags", async () => {
    const golds = [
      { id: "g1", claim: "claim one", gold: { verdict: "refuted" }, tags: ["numerical-claim"] },
      {
        id: "g2",
        claim: "claim two",
        gold: { verdict: "supported" },
        tags: ["quote-verification"],
      },
    ];
    // Fake pipeline: a verdict keyed off the claim text — no model, no network, no keys.
    const fakeRun = async (text: string) => ({
      source: { verdict: text === "claim one" ? "refuted" : "nei" },
    });
    const items = await runEval(golds, fakeRun);
    expect(items).toMatchObject([
      {
        id: "g1",
        claim: "claim one",
        gold: "refuted",
        predicted: "refuted",
        tags: ["numerical-claim"],
      },
      {
        id: "g2",
        claim: "claim two",
        gold: "supported",
        predicted: "nei",
        tags: ["quote-verification"],
      },
    ]);
  });

  it("captures per-claim rationale and evidence detail for qualitative diagnosis", async () => {
    // Why the model decided what it did lives in the claim rationale and the evidence stances —
    // the harness must retain them. It used to keep only the verdict, which can't explain a miss.
    const golds = [{ id: "g", claim: "c", gold: { verdict: "nei" }, tags: [] }];
    const fakeGraph = {
      source: { verdict: "refuted" },
      claims: [
        {
          id: "c1",
          text: "c",
          verdict: "refuted",
          rationale: "a source refutes it",
          checkable: true,
        },
      ],
      evidence: [
        {
          questionId: "c1-q1",
          domain: "bbc.com",
          url: "https://bbc.com/x",
          stance: "refutes",
          reliability: "high",
          stanceConfidence: 0.9,
          sourceType: "primary",
        },
      ],
    };
    const [item] = await runEval(golds, async () => fakeGraph);
    const detail = item.detail as {
      claims: Record<string, unknown>[];
      evidence: Record<string, unknown>[];
    };
    expect(detail.claims[0].rationale).toBe("a source refutes it");
    expect(detail.evidence[0]).toMatchObject({ stance: "refutes", reliability: "high" });
  });

  it("coerces a missing document verdict to null (so scoring counts it a miss, not nei)", async () => {
    const golds = [{ id: "g", claim: "c", gold: { verdict: "nei" }, tags: [] }];
    const items = await runEval(golds, async () => ({ source: { verdict: null } }));
    expect(items[0].predicted).toBeNull();
  });

  it("threads the gold's claimDate to the runner as the as-of date (anti-leakage)", async () => {
    const golds = [
      { id: "g1", claim: "c1", claimDate: "2020-10-15", gold: { verdict: "nei" }, tags: [] },
      { id: "g2", claim: "c2", gold: { verdict: "nei" }, tags: [] }, // no date → undefined
    ];
    const seen: Array<{ claim: string; asOf?: string }> = [];
    await runEval(golds, async (claim: string, asOf?: string) => {
      seen.push({ claim, asOf });
      return { source: { verdict: "nei" } };
    });
    expect(seen).toEqual([
      { claim: "c1", asOf: "2020-10-15" },
      { claim: "c2", asOf: undefined },
    ]);
  });
});
