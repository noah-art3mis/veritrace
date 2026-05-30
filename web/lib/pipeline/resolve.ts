import type { ClaimItem, QuestionItem, EvidenceItem, Verdict } from "../graph-types";
import type { SearchOptions } from "../exa";
import type { PipelineDeps } from "./deps";
import { classifyEvidence } from "./classify";
import { expandQuery } from "./expand";

// Days of slack around a claim's event date for the retrieval window. The lower bound cuts
// stale/unrelated older matches; the upper bound keeps the day-of and following-week
// primary reporting that actually settles a breaking-news claim, while excluding much later
// re-litigation. Fact-check outlets are excluded by domain regardless of date.
const WINDOW_BEFORE_DAYS = 30;
const WINDOW_AFTER_DAYS = 14;
const MS_PER_DAY = 86_400_000;

/** A centered publication window around a claim's event date, or undefined if no date is known. */
export function dateWindow(date?: string): SearchOptions | undefined {
  if (!date) return undefined;
  const t = Date.parse(date);
  if (Number.isNaN(t)) return undefined;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return {
    startPublishedDate: iso(t - WINDOW_BEFORE_DAYS * MS_PER_DAY),
    endPublishedDate: iso(t + WINDOW_AFTER_DAYS * MS_PER_DAY),
  };
}

/** Retrieve (de novo) + classify the evidence answering one question. */
export async function resolveQuestion(
  claim: ClaimItem,
  question: QuestionItem,
  deps: PipelineDeps,
): Promise<EvidenceItem[]> {
  const query = await expandQuery(claim, question, deps.ask);
  const raw = await deps.search(query, dateWindow(claim.date));
  return classifyEvidence(claim, question, raw, deps.ask);
}

/** A one-line advisory "why" — composed from the deciding evidence, never asserted as truth. */
export function rationaleFor(
  claim: ClaimItem,
  verdict: Verdict,
  evidence: EvidenceItem[],
): string {
  if (!claim.checkable) {
    return "Rests on imagery or media provenance this text-only build cannot verify.";
  }
  if (claim.checkworthy === false) {
    return "Subjective or opinion statement — not a checkable factual assertion.";
  }
  if (verdict === "nei") {
    // Make the insufficiency self-explaining (Kotonya & Toni; CLUE): say WHY, not just NEI.
    if (evidence.length === 0) {
      return "No primary sources answered this claim's questions.";
    }
    const found = uniqueDomains(evidence);
    const n = evidence.length;
    return `Found ${n} source${n === 1 ? "" : "s"} (${found}) but none cleared the reliability and clarity bar.`;
  }
  const deciding = pickDeciding(verdict, evidence);
  const domains = uniqueDomains(deciding);
  switch (verdict) {
    case "supported":
      return `Supported by ${domains}.`;
    case "refuted":
      return `Refuted by ${domains} (e.g. an official denial or contradicting report).`;
    case "conflicting":
      return `Sources conflict — both supporting and refuting primary evidence found (${domains}).`;
    default:
      return "";
  }
}

function pickDeciding(verdict: Verdict, evidence: EvidenceItem[]): EvidenceItem[] {
  if (verdict === "supported") return evidence.filter((e) => e.stance === "supports");
  if (verdict === "refuted") return evidence.filter((e) => e.stance === "refutes");
  return evidence;
}

function uniqueDomains(evidence: EvidenceItem[]): string {
  const domains = [...new Set(evidence.map((e) => e.domain))];
  if (domains.length === 0) return "the retrieved sources";
  if (domains.length <= 2) return domains.join(" and ");
  return `${domains.slice(0, 2).join(", ")} and others`;
}
