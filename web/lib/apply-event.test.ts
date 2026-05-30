import { describe, it, expect } from "vitest";
import { applyEvent, emptyGraph } from "./apply-event";
import type { FactGraph, ClaimItem, QuestionItem, EvidenceItem } from "./graph-types";
import type { PipelineEvent } from "./pipeline/events";

function baseGraph(): FactGraph {
  return emptyGraph("source text");
}

const aClaim: ClaimItem = {
  id: "c1",
  text: "claim",
  checkable: true,
  verdict: null,
};

const aQuestion: QuestionItem = {
  id: "c1-q1",
  claimId: "c1",
  text: "question?",
  status: "pending",
};

const anEvidence: EvidenceItem = {
  id: "c1-q1-e1",
  questionId: "c1-q1",
  title: "title",
  url: "https://example.com",
  domain: "example.com",
  passage: "passage",
  stance: "supports",
  reliability: "high",
  sourceType: "primary",
  stanceConfidence: 0.9,
};

describe("emptyGraph", () => {
  it("seeds a root source node with the given text and no verdict", () => {
    const g = emptyGraph("hello");
    expect(g.source).toEqual({ id: "src", text: "hello", verdict: null });
  });

  it("starts with empty claim/question/evidence layers", () => {
    const g = emptyGraph("hello");
    expect(g.claims).toEqual([]);
    expect(g.questions).toEqual([]);
    expect(g.evidence).toEqual([]);
  });
});

describe("applyEvent immutability", () => {
  it("never mutates the input graph", () => {
    const g = baseGraph();
    const snapshot = structuredClone(g);
    applyEvent(g, { type: "claim", claim: aClaim });
    expect(g).toEqual(snapshot);
  });

  it("returns a new graph object reference", () => {
    const g = baseGraph();
    const next = applyEvent(g, { type: "claim", claim: aClaim });
    expect(next).not.toBe(g);
  });
});

describe("applyEvent by type", () => {
  it("source replaces the root node", () => {
    const ev: PipelineEvent = {
      type: "source",
      source: { id: "src", text: "new", verdict: null },
    };
    expect(applyEvent(baseGraph(), ev).source.text).toBe("new");
  });

  it("claim appends to the claim layer", () => {
    const g = applyEvent(baseGraph(), { type: "claim", claim: aClaim });
    expect(g.claims).toEqual([aClaim]);
  });

  it("question appends to the question layer", () => {
    const g = applyEvent(baseGraph(), { type: "question", question: aQuestion });
    expect(g.questions).toEqual([aQuestion]);
  });

  it("evidence appends to the evidence layer", () => {
    const g = applyEvent(baseGraph(), { type: "evidence", evidence: anEvidence });
    expect(g.evidence).toEqual([anEvidence]);
  });

  it("question_status updates only the matching question's status", () => {
    let g = applyEvent(baseGraph(), { type: "question", question: aQuestion });
    g = applyEvent(g, {
      type: "question",
      question: { ...aQuestion, id: "c1-q2" },
    });
    g = applyEvent(g, { type: "question_status", id: "c1-q1", status: "answered" });
    expect(g.questions.find((q) => q.id === "c1-q1")?.status).toBe("answered");
    expect(g.questions.find((q) => q.id === "c1-q2")?.status).toBe("pending");
  });

  it("question_status for an unknown id is a no-op on contents", () => {
    const g = applyEvent(baseGraph(), { type: "question", question: aQuestion });
    const next = applyEvent(g, { type: "question_status", id: "nope", status: "answered" });
    expect(next.questions).toEqual(g.questions);
  });

  it("claim_verdict sets verdict and rationale on the matching claim", () => {
    const g = applyEvent(baseGraph(), { type: "claim", claim: aClaim });
    const next = applyEvent(g, {
      type: "claim_verdict",
      id: "c1",
      verdict: "refuted",
      rationale: "because",
    });
    expect(next.claims[0]).toMatchObject({ verdict: "refuted", rationale: "because" });
  });

  it("claim_verdict leaves non-matching claims untouched", () => {
    let g = applyEvent(baseGraph(), { type: "claim", claim: aClaim });
    g = applyEvent(g, { type: "claim", claim: { ...aClaim, id: "c2" } });
    g = applyEvent(g, {
      type: "claim_verdict",
      id: "c1",
      verdict: "supported",
      rationale: "x",
    });
    expect(g.claims.find((c) => c.id === "c2")?.verdict).toBeNull();
  });

  it("source_verdict sets the aggregated verdict while preserving source text", () => {
    const g = applyEvent(baseGraph(), { type: "source_verdict", verdict: "conflicting" });
    expect(g.source.verdict).toBe("conflicting");
    expect(g.source.text).toBe("source text");
  });

  it("source_verdict carries the claim tally onto the source (support ratio)", () => {
    const tally = { supported: 2, refuted: 1, conflicting: 0, nei: 1, total: 4 };
    const g = applyEvent(baseGraph(), { type: "source_verdict", verdict: "conflicting", tally });
    expect(g.source.tally).toEqual(tally);
  });

  it("done returns the graph unchanged", () => {
    const g = applyEvent(baseGraph(), { type: "claim", claim: aClaim });
    expect(applyEvent(g, { type: "done" })).toBe(g);
  });

  it("error returns the graph unchanged", () => {
    const g = applyEvent(baseGraph(), { type: "claim", claim: aClaim });
    expect(applyEvent(g, { type: "error", message: "boom" })).toBe(g);
  });
});

describe("applyEvent stream replay", () => {
  it("rebuilds a full graph from an ordered event sequence", () => {
    const events: PipelineEvent[] = [
      { type: "source", source: { id: "src", text: "S", verdict: null } },
      { type: "claim", claim: aClaim },
      { type: "question", question: aQuestion },
      { type: "question_status", id: "c1-q1", status: "searching" },
      { type: "evidence", evidence: anEvidence },
      { type: "question_status", id: "c1-q1", status: "answered" },
      { type: "claim_verdict", id: "c1", verdict: "supported", rationale: "ok" },
      { type: "source_verdict", verdict: "supported" },
      { type: "done" },
    ];
    const graph = events.reduce(applyEvent, emptyGraph(""));
    expect(graph.source.verdict).toBe("supported");
    expect(graph.claims).toHaveLength(1);
    expect(graph.claims[0].verdict).toBe("supported");
    expect(graph.questions[0].status).toBe("answered");
    expect(graph.evidence).toHaveLength(1);
  });
});
