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
    expect(items).toEqual([
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

  it("coerces a missing document verdict to null (so scoring counts it a miss, not nei)", async () => {
    const golds = [{ id: "g", claim: "c", gold: { verdict: "nei" }, tags: [] }];
    const items = await runEval(golds, async () => ({ source: { verdict: null } }));
    expect(items[0].predicted).toBeNull();
  });
});
