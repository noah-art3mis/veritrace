import type {
  SourceTextItem,
  ClaimItem,
  QuestionItem,
  EvidenceItem,
  Verdict,
  QuestionStatus,
  QuestionTrace,
  ClaimTally,
} from "../graph-types";

// The wire protocol for the live build. Each event is one NDJSON line emitted by
// /api/check and applied to the client's graph state as it arrives, so the evidence
// graph builds itself node by node ("watch it think").
export type PipelineEvent =
  | { type: "source"; source: SourceTextItem }
  | { type: "claim"; claim: ClaimItem }
  | { type: "question"; question: QuestionItem }
  | { type: "question_status"; id: string; status: QuestionStatus }
  | { type: "question_trace"; id: string; trace: QuestionTrace }
  | { type: "evidence"; evidence: EvidenceItem }
  | { type: "claim_verdict"; id: string; verdict: Verdict; rationale: string }
  | { type: "source_verdict"; verdict: Verdict; tally?: ClaimTally }
  // Non-fatal, run-level advisory (#100): the run finished, but something about it makes the
  // results unreliable — e.g. EVERY web search errored (Exa credits exhausted / key revoked), so
  // the graph degraded to all-NEI not because the web lacks answers but because retrieval is down.
  // Distinct from `error` (which aborts): the graph still renders, with a banner over it.
  | { type: "warning"; message: string }
  | { type: "error"; message: string }
  | { type: "done" };
