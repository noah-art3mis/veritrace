import { describe, it, expect } from "vitest";
import { DEMO_CACHE } from "./demo-cache";
import { FACT_CHECKERS } from "./exa";
import { claimVerdict, sourceVerdict } from "./pipeline/verdict";
import type { EvidenceItem } from "./graph-types";

// The wifi-death fallback graphs are captured by hand. These tests guard the two ways
// they can rot: (1) drifting away from the deterministic verdict rules the live pipeline
// applies, and (2) referential breakage that would make the replay emit dangling nodes.
// They also re-assert the de-novo honesty bar on the captured evidence.

const entries = Object.entries(DEMO_CACHE);

it("ships the rehearsed demo fallback graphs", () => {
  // Guards the rot that would silently disable the wifi-death fallback: the cache emptied
  // or the module failing to load. The chip COUNT is a product decision (chips come and go),
  // so we don't snapshot it — only that at least one rehearsed graph ships.
  expect(entries.length).toBeGreaterThan(0);
});

describe.each(entries)("cached graph: %s", (key, graph) => {
  const claimIds = new Set(graph.claims.map((c) => c.id));
  const questionById = new Map(graph.questions.map((q) => [q.id, q]));

  function evidenceForClaim(claimId: string): EvidenceItem[] {
    return graph.evidence.filter((e) => questionById.get(e.questionId)?.claimId === claimId);
  }

  it("is keyed by its own source text", () => {
    expect(key).toBe(graph.source.text);
  });

  it("has every question pointing at a real claim", () => {
    for (const q of graph.questions) expect(claimIds.has(q.claimId)).toBe(true);
  });

  it("has every evidence item pointing at a real question", () => {
    for (const e of graph.evidence) expect(questionById.has(e.questionId)).toBe(true);
  });

  it("is a finished run — every question is answered", () => {
    for (const q of graph.questions) expect(q.status).toBe("answered");
  });

  it("has cached claim verdicts that match the deterministic rule", () => {
    for (const c of graph.claims) {
      expect(c.verdict).toBe(claimVerdict(c, evidenceForClaim(c.id)));
    }
  });

  it("has a cached source verdict that matches aggregation of its claims", () => {
    const expected = sourceVerdict(graph.claims.map((c) => c.verdict ?? "nei"));
    expect(graph.source.verdict).toBe(expected);
  });

  it("gives every checkable claim at least one resolving question", () => {
    for (const c of graph.claims) {
      if (!c.checkable) continue;
      const hasQuestion = graph.questions.some((q) => q.claimId === c.id);
      expect(hasQuestion).toBe(true);
    }
  });

  it("retrieved no evidence from an excluded fact-check outlet (de-novo bar)", () => {
    for (const e of graph.evidence) {
      expect(FACT_CHECKERS).not.toContain(e.domain);
    }
  });
});
