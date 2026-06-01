import type { FactGraph, ClaimItem, QuestionItem, EvidenceItem, Verdict } from "../graph-types";
import type { PipelineEvent } from "./events";
import type { PipelineDeps } from "./deps";
import { extractClaims } from "./extract";
import { generateQuestions } from "./questions";
import { resolveQuestion, rationaleFor } from "./resolve";
import { claimVerdict, sourceVerdict, tallyClaims } from "./verdict";
import { isRelevanceDropped } from "./claim-status";

/**
 * Run the VERITRACE pipeline as a stream of events. The rhythm matches the demo
 * narration: decompose the source text into claims, then ask the questions for every
 * claim, then fan out all retrievals in parallel and emit each evidence card the
 * moment it lands. A claim's verdict resolves as soon as its last question answers;
 * the source-level verdict is the finale.
 */
export async function* streamPipeline(
  sourceText: string,
  deps: PipelineDeps,
): AsyncGenerator<PipelineEvent> {
  yield { type: "source", source: { id: "src", text: sourceText, verdict: null } };

  // 1. Decompose.
  const claims = await extractClaims(sourceText, deps.ask, deps.maxClaims);
  for (const claim of claims) yield { type: "claim", claim };
  const claimById = new Map(claims.map((c) => [c.id, c]));

  // 2. Ask questions for every claim (parallel), then emit them.
  const questionLists = await Promise.all(
    claims.map((c) => generateQuestions(c, deps.ask, deps.maxQuestions)),
  );
  const allQuestions: QuestionItem[] = questionLists.flat();
  for (const q of allQuestions) yield { type: "question", question: q };

  // Track per-claim outstanding questions so we can resolve each verdict as it completes.
  const remaining = new Map<string, number>();
  const evidenceByClaim = new Map<string, EvidenceItem[]>();
  const verdictByClaim = new Map<string, Verdict>();
  for (const c of claims) {
    remaining.set(c.id, 0);
    evidenceByClaim.set(c.id, []);
  }
  for (const q of allQuestions) remaining.set(q.claimId, (remaining.get(q.claimId) ?? 0) + 1);

  // 3. Question-less claims resolve to NEI immediately (unverifiable-by-text / opinion).
  // Relevance-dropped claims are the exception: they were segmented out before search, so
  // they carry no verdict at all — the renderer shows them greyed as "dropped", not NEI.
  for (const c of claims) {
    if (isRelevanceDropped(c)) continue;
    if ((remaining.get(c.id) ?? 0) === 0) {
      const verdict = claimVerdict(c, []);
      verdictByClaim.set(c.id, verdict);
      yield { type: "claim_verdict", id: c.id, verdict, rationale: rationaleFor(c, verdict, []) };
    }
  }

  // 4. Retrieve evidence for all questions in parallel; emit as each completes.
  for (const q of allQuestions) yield { type: "question_status", id: q.id, status: "searching" };

  const tasks = allQuestions.map((q) =>
    resolveQuestion(claimById.get(q.claimId)!, q, deps).then(({ evidence, trace }) => ({
      q,
      evidence,
      trace,
    })),
  );

  for await (const { q, evidence, trace } of asCompleted(tasks)) {
    yield { type: "question_status", id: q.id, status: "answered" };
    yield { type: "question_trace", id: q.id, trace };
    for (const e of evidence) yield { type: "evidence", evidence: e };

    const bucket = evidenceByClaim.get(q.claimId)!;
    bucket.push(...evidence);
    remaining.set(q.claimId, (remaining.get(q.claimId) ?? 1) - 1);

    if (remaining.get(q.claimId) === 0) {
      const claim = claimById.get(q.claimId)!;
      const verdict = claimVerdict(claim, bucket);
      verdictByClaim.set(q.claimId, verdict);
      yield {
        type: "claim_verdict",
        id: claim.id,
        verdict,
        rationale: rationaleFor(claim, verdict, bucket),
      };
    }
  }

  // 5. Finale: aggregate to the source-text verdict (in claim order), with the support
  // tally. Relevance-dropped claims are excluded from the aggregate and the "of N" — they
  // were never checked — but counted separately so the UI can show "· 3 dropped".
  const checked = claims.filter((c) => !isRelevanceDropped(c));
  const verdicts = checked.map((c) => verdictByClaim.get(c.id) ?? "nei");
  const tally = tallyClaims(verdicts, claims.length - checked.length);
  yield { type: "source_verdict", verdict: sourceVerdict(verdicts), tally };
  yield { type: "done" };
}

/** Yield the results of an array of promises in completion order (not input order). */
async function* asCompleted<T>(promises: Promise<T>[]): AsyncGenerator<T> {
  const pending = new Map(promises.map((p, i) => [i, p.then((v) => ({ i, v }))]));
  while (pending.size > 0) {
    const { i, v } = await Promise.race(pending.values());
    pending.delete(i);
    yield v;
  }
}

/** Drain the stream into a finished graph — the non-streaming path (tests / cache priming). */
export async function collectGraph(sourceText: string, deps: PipelineDeps): Promise<FactGraph> {
  const graph: FactGraph = {
    source: { id: "src", text: sourceText, verdict: null },
    claims: [],
    questions: [],
    evidence: [],
  };
  const claimMap = new Map<string, ClaimItem>();

  for await (const ev of streamPipeline(sourceText, deps)) {
    switch (ev.type) {
      case "source":
        graph.source = ev.source;
        break;
      case "claim":
        graph.claims.push(ev.claim);
        claimMap.set(ev.claim.id, ev.claim);
        break;
      case "question":
        graph.questions.push(ev.question);
        break;
      case "question_status": {
        const q = graph.questions.find((x) => x.id === ev.id);
        if (q) q.status = ev.status;
        break;
      }
      case "question_trace": {
        const q = graph.questions.find((x) => x.id === ev.id);
        if (q) q.trace = ev.trace;
        break;
      }
      case "evidence":
        graph.evidence.push(ev.evidence);
        break;
      case "claim_verdict": {
        const c = claimMap.get(ev.id);
        if (c) {
          c.verdict = ev.verdict;
          c.rationale = ev.rationale;
        }
        break;
      }
      case "source_verdict":
        graph.source.verdict = ev.verdict;
        graph.source.tally = ev.tally;
        break;
    }
  }
  return graph;
}
