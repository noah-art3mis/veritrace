import type {
  SourceTextItem,
  ClaimItem,
  QuestionItem,
  EvidenceItem,
  Verdict,
  QuestionStatus,
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
  | { type: "evidence"; evidence: EvidenceItem }
  | { type: "claim_verdict"; id: string; verdict: Verdict; rationale: string }
  | { type: "source_verdict"; verdict: Verdict; tally?: ClaimTally }
  | { type: "error"; message: string }
  | { type: "done" };
