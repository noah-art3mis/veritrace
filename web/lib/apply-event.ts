import type { FactGraph } from "./graph-types";
import type { PipelineEvent } from "./pipeline/events";

export function emptyGraph(sourceText: string): FactGraph {
  return {
    source: { id: "src", text: sourceText, verdict: null },
    claims: [],
    questions: [],
    evidence: [],
  };
}

/**
 * Apply one streamed event to the graph immutably (returns a new graph so React
 * re-renders). Mirrors collectGraph on the server, but produces fresh objects per
 * event for the live build.
 */
export function applyEvent(graph: FactGraph, ev: PipelineEvent): FactGraph {
  switch (ev.type) {
    case "source":
      return { ...graph, source: ev.source };
    case "claim":
      return { ...graph, claims: [...graph.claims, ev.claim] };
    case "question":
      return { ...graph, questions: [...graph.questions, ev.question] };
    case "question_status":
      return {
        ...graph,
        questions: graph.questions.map((q) =>
          q.id === ev.id ? { ...q, status: ev.status } : q,
        ),
      };
    case "evidence":
      return { ...graph, evidence: [...graph.evidence, ev.evidence] };
    case "claim_verdict":
      return {
        ...graph,
        claims: graph.claims.map((c) =>
          c.id === ev.id ? { ...c, verdict: ev.verdict, rationale: ev.rationale } : c,
        ),
      };
    case "source_verdict":
      return { ...graph, source: { ...graph.source, verdict: ev.verdict, tally: ev.tally } };
    case "error":
    case "done":
      return graph;
  }
}
