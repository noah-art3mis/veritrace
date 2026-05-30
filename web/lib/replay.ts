import type { FactGraph, QuestionItem, EvidenceItem } from "./graph-types";
import type { PipelineEvent } from "./pipeline/events";
import { tallyClaims } from "./pipeline/verdict";

interface TimedEvent {
  event: PipelineEvent;
  delay: number; // ms to wait BEFORE applying this event
}

/**
 * Turn a finished (cached) graph back into the streamed event order, mirroring
 * streamPipeline's beats, so the wifi-death fallback still builds the graph live.
 * Replays in claim order (good enough for a fallback) rather than completion order.
 */
export function graphToEvents(graph: FactGraph): TimedEvent[] {
  const out: TimedEvent[] = [];
  const add = (event: PipelineEvent, delay: number) => out.push({ event, delay });

  add({ type: "source", source: { ...graph.source, verdict: null } }, 150);
  for (const c of graph.claims) {
    add({ type: "claim", claim: { ...c, verdict: null, rationale: undefined } }, 340);
  }

  const questionsByClaim = new Map<string, QuestionItem[]>();
  for (const q of graph.questions) {
    add({ type: "question", question: { ...q, status: "pending" } }, 230);
    const arr = questionsByClaim.get(q.claimId) ?? [];
    arr.push(q);
    questionsByClaim.set(q.claimId, arr);
  }

  // Claims with no questions (unverifiable-by-text) resolve to their verdict immediately.
  for (const c of graph.claims) {
    if (!questionsByClaim.get(c.id)?.length) {
      add({ type: "claim_verdict", id: c.id, verdict: c.verdict ?? "nei", rationale: c.rationale ?? "" }, 280);
    }
  }

  for (const q of graph.questions) {
    add({ type: "question_status", id: q.id, status: "searching" }, 80);
  }

  const evidenceByQuestion = new Map<string, EvidenceItem[]>();
  for (const e of graph.evidence) {
    const arr = evidenceByQuestion.get(e.questionId) ?? [];
    arr.push(e);
    evidenceByQuestion.set(e.questionId, arr);
  }
  const remaining = new Map<string, number>();
  for (const [cid, qs] of questionsByClaim) remaining.set(cid, qs.length);
  const claimById = new Map(graph.claims.map((c) => [c.id, c]));

  for (const q of graph.questions) {
    add({ type: "question_status", id: q.id, status: "answered" }, 540);
    for (const e of evidenceByQuestion.get(q.id) ?? []) {
      add({ type: "evidence", evidence: e }, 240);
    }
    const rem = (remaining.get(q.claimId) ?? 1) - 1;
    remaining.set(q.claimId, rem);
    if (rem === 0) {
      const c = claimById.get(q.claimId);
      if (c) add({ type: "claim_verdict", id: c.id, verdict: c.verdict ?? "nei", rationale: c.rationale ?? "" }, 200);
    }
  }

  const tally = graph.source.tally ?? tallyClaims(graph.claims.map((c) => c.verdict ?? "nei"));
  add({ type: "source_verdict", verdict: graph.source.verdict ?? "nei", tally }, 380);
  add({ type: "done" }, 0);
  return out;
}
