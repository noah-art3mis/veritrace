import type { ReasoningProvider } from "../reasoner-types";
import type { ClaimItem } from "../graph-types";
import { segmentUtterances } from "./segment";
import { triageUtterances } from "./triage";

// The extract stage in SAFE shape, two model passes:
//   1. SEGMENT   — break the source into every atomic utterance (granular, no merge).
//   2. TRIAGE    — decontextualize each + relevance-filter to the load-bearing claims.
// The returned list is the FULL decomposition (so the breakdown is legible); only the
// searchable subset (<= maxClaims) goes on to question-generation and retrieval.
export async function extractClaims(
  sourceText: string,
  ask: ReasoningProvider,
  maxClaims: number,
  asOf?: string,
): Promise<ClaimItem[]> {
  const utterances = await segmentUtterances(sourceText, ask);
  return triageUtterances(sourceText, utterances, ask, maxClaims, asOf);
}
