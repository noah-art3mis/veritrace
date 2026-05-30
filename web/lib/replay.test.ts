import { describe, it, expect } from "vitest";
import { graphToEvents } from "./replay";
import { applyEvent, emptyGraph } from "./apply-event";
import type { FactGraph, ClaimItem, QuestionItem, EvidenceItem } from "./graph-types";
import type { PipelineEvent } from "./pipeline/events";

// graphToEvents turns a finished cached graph back into the streamed beat order so the
// wifi-death fallback still "builds itself". The reconstructed graph must match the
// original, and the event order must respect the source → claim → question → evidence
// → verdict dependency chain.

function evidence(id: string, questionId: string): EvidenceItem {
  return {
    id,
    questionId,
    title: "t",
    url: "https://example.com",
    domain: "example.com",
    passage: "p",
    stance: "supports",
    reliability: "high",
    sourceType: "primary",
    stanceConfidence: 0.9,
  };
}

function finishedGraph(): FactGraph {
  const claims: ClaimItem[] = [
    { id: "c1", text: "checkable claim", checkable: true, verdict: "supported", rationale: "r1" },
    { id: "c2", text: "media claim", checkable: false, verdict: "nei", rationale: "r2" },
  ];
  const questions: QuestionItem[] = [
    { id: "c1-q1", claimId: "c1", text: "q1?", status: "answered" },
    { id: "c1-q2", claimId: "c1", text: "q2?", status: "answered" },
  ];
  const evidenceItems = [
    evidence("c1-q1-e1", "c1-q1"),
    evidence("c1-q2-e1", "c1-q2"),
  ];
  return {
    source: {
      id: "src",
      text: "the post",
      verdict: "supported",
      tally: { supported: 1, refuted: 0, conflicting: 0, nei: 1, total: 2 },
    },
    claims,
    questions,
    evidence: evidenceItems,
  };
}

function types(events: PipelineEvent[]): string[] {
  return events.map((e) => e.type);
}

describe("graphToEvents ordering", () => {
  const timed = graphToEvents(finishedGraph());
  const events = timed.map((t) => t.event);

  it("starts with the source and ends with done", () => {
    expect(events[0].type).toBe("source");
    expect(events[events.length - 1].type).toBe("done");
  });

  it("emits exactly one done and one source_verdict", () => {
    expect(types(events).filter((t) => t === "done")).toHaveLength(1);
    expect(types(events).filter((t) => t === "source_verdict")).toHaveLength(1);
  });

  it("emits each claim before any of its questions", () => {
    const claimIdx = events.findIndex((e) => e.type === "claim");
    const questionIdx = events.findIndex((e) => e.type === "question");
    expect(claimIdx).toBeGreaterThanOrEqual(0);
    expect(claimIdx).toBeLessThan(questionIdx);
  });

  it("emits a question's evidence only after that question reaches 'answered'", () => {
    const answeredIdx = events.findIndex(
      (e) => e.type === "question_status" && e.id === "c1-q1" && e.status === "answered",
    );
    const evidenceIdx = events.findIndex(
      (e) => e.type === "evidence" && e.evidence.id === "c1-q1-e1",
    );
    expect(answeredIdx).toBeGreaterThanOrEqual(0);
    expect(answeredIdx).toBeLessThan(evidenceIdx);
  });

  it("resets verdicts/status so the replay builds from a blank slate", () => {
    const sourceEv = events.find((e) => e.type === "source");
    expect(sourceEv).toMatchObject({ source: { verdict: null } });
    const claimEvents = events.filter((e) => e.type === "claim");
    for (const ce of claimEvents) {
      expect(ce).toMatchObject({ claim: { verdict: null, rationale: undefined } });
    }
    const questionEvents = events.filter((e) => e.type === "question");
    for (const qe of questionEvents) {
      expect(qe).toMatchObject({ question: { status: "pending" } });
    }
  });

  it("resolves a question-less (unverifiable) claim verdict immediately, without evidence", () => {
    // c2 is unckeckable → no questions → its verdict event must still appear.
    const c2Verdict = events.find(
      (e) => e.type === "claim_verdict" && e.id === "c2",
    );
    expect(c2Verdict).toMatchObject({ verdict: "nei" });
  });

  it("only emits a claim's verdict after its last question is answered", () => {
    const c1VerdictIdx = events.findIndex(
      (e) => e.type === "claim_verdict" && e.id === "c1",
    );
    const lastQAnsweredIdx = events.reduce(
      (acc, e, i) =>
        e.type === "question_status" && e.status === "answered" && e.id.startsWith("c1-")
          ? i
          : acc,
      -1,
    );
    expect(c1VerdictIdx).toBeGreaterThan(lastQAnsweredIdx);
  });

  it("attaches a non-negative delay to every event", () => {
    for (const t of timed) expect(t.delay).toBeGreaterThanOrEqual(0);
  });
});

describe("graphToEvents round-trips through applyEvent", () => {
  it("reconstructs a graph equal to the original (verdicts and all)", () => {
    const original = finishedGraph();
    const rebuilt = graphToEvents(original)
      .map((t) => t.event)
      .reduce(applyEvent, emptyGraph(original.source.text));

    expect(rebuilt.source).toEqual(original.source);
    expect(rebuilt.claims).toEqual(original.claims);
    // Replay marks every question answered, matching the finished cache.
    expect(rebuilt.questions).toEqual(original.questions);
    expect(new Set(rebuilt.evidence)).toEqual(new Set(original.evidence));
  });

  it("falls back to nei when a cached claim/source verdict is missing", () => {
    const g = finishedGraph();
    g.source.verdict = null;
    g.claims[0].verdict = null;
    const rebuilt = graphToEvents(g)
      .map((t) => t.event)
      .reduce(applyEvent, emptyGraph(g.source.text));
    expect(rebuilt.source.verdict).toBe("nei");
    expect(rebuilt.claims[0].verdict).toBe("nei");
  });
});
