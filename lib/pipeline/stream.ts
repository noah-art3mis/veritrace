import type {
  FactGraph,
  ClaimItem,
  QuestionItem,
  EvidenceItem,
  Verdict,
  QuestionTrace,
} from "../graph-types";
import type { PipelineEvent } from "./events";
import type { PipelineDeps } from "./deps";
import { extractClaims } from "./extract";
import { generateQuestions } from "./questions";
import { resolveQuestion, rationaleFor, type RetrievalOutcome } from "./resolve";
import { claimVerdict, sourceVerdict, tallyClaims } from "./verdict";
import { isRelevanceDropped, isSearchable } from "./claim-status";
import { factCheckEvidence, factCheckRationale } from "../factcheck";

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
  const claims = await extractClaims(sourceText, deps.ask, deps.maxClaims, deps.asOf);
  for (const claim of claims) yield { type: "claim", claim };
  const claimById = new Map(claims.map((c) => [c.id, c]));

  // Per-claim verdicts accumulate here from three sources: the fact-check short-circuit
  // (below), the question-less NEI rule, and the de-novo retrieval finale.
  const verdictByClaim = new Map<string, Verdict>();

  // 1b. Fact-check short-circuit (OPT-IN; off unless deps.factCheck is present). Before any
  // question generation or web retrieval, ask whether a known fact-checker has ALREADY
  // adjudicated each claim. On a confident hit we emit that finding as evidence under a
  // synthetic question node and resolve the claim now — skipping the expensive HyDE → Exa
  // gather loop → classify path. When deps.factCheck is absent this whole block is a no-op
  // and the pipeline runs fully de novo. We only short-circuit on a DECIDING verdict (the
  // fact-checks map to a clear supported/refuted); an ambiguous/empty result falls through.
  const shortCircuited = new Set<string>();
  if (deps.factCheck) {
    const candidates = claims.filter(isSearchable);
    const lookups = await Promise.all(
      candidates.map(
        (c) =>
          deps.factCheck!(c.text)
            .then((hits) => ({ c, hits }))
            .catch(() => ({ c, hits: [] })), // a lookup failure ⇒ fall through to de novo
      ),
    );
    for (const { c, hits } of lookups) {
      if (hits.length === 0) continue;
      const questionId = `${c.id}-fc`;
      const evidence = factCheckEvidence(hits, questionId);
      // The short-circuit trusts a published fact-checker's adjudication, which is `secondary`
      // by design — so it opts out of the de-novo primary-source guard (#51).
      const verdict = claimVerdict(c, evidence, { requirePrimary: false });
      if (verdict === "nei") continue; // no confident existing adjudication → keep de novo
      shortCircuited.add(c.id);
      verdictByClaim.set(c.id, verdict);
      // A synthetic, already-answered question keeps the graph's 4-layer shape intact so the
      // short-circuit renders like any other resolved question.
      const question: QuestionItem = {
        id: questionId,
        claimId: c.id,
        text: "Has a known fact-checker already adjudicated this claim?",
        status: "answered",
      };
      yield { type: "question", question };
      for (const e of evidence) yield { type: "evidence", evidence: e };
      yield {
        type: "claim_verdict",
        id: c.id,
        verdict,
        rationale: factCheckRationale(verdict, hits),
      };
    }
  }

  // 2. Ask questions for every claim NOT already short-circuited (parallel), then emit them.
  const toResolve = claims.filter((c) => !shortCircuited.has(c.id));
  const questionLists = await Promise.all(
    toResolve.map((c) => generateQuestions(c, deps.ask, deps.maxQuestions)),
  );
  const allQuestions: QuestionItem[] = questionLists.flat();
  for (const q of allQuestions) yield { type: "question", question: q };

  // Track per-claim outstanding questions so we can resolve each verdict as it completes.
  const remaining = new Map<string, number>();
  const evidenceByClaim = new Map<string, EvidenceItem[]>();
  for (const c of claims) {
    remaining.set(c.id, 0);
    evidenceByClaim.set(c.id, []);
  }
  for (const q of allQuestions) remaining.set(q.claimId, (remaining.get(q.claimId) ?? 0) + 1);

  // 3. Question-less claims resolve to NEI immediately (unverifiable-by-text / opinion).
  // Relevance-dropped claims are the exception: they were segmented out before search, so
  // they carry no verdict at all — the renderer shows them greyed as "dropped", not NEI.
  // Already-short-circuited claims are skipped — they carry a fact-check verdict.
  for (const c of claims) {
    if (isRelevanceDropped(c) || verdictByClaim.has(c.id)) continue;
    if ((remaining.get(c.id) ?? 0) === 0) {
      const verdict = claimVerdict(c, []);
      verdictByClaim.set(c.id, verdict);
      yield { type: "claim_verdict", id: c.id, verdict, rationale: rationaleFor(c, verdict, []) };
    }
  }

  // 4. Retrieve evidence for all questions in parallel; emit as each completes.
  for (const q of allQuestions) yield { type: "question_status", id: q.id, status: "searching" };

  const tasks = allQuestions.map((q) =>
    resolveQuestion(claimById.get(q.claimId)!, q, deps)
      .then(({ evidence, trace, retrieval }) => ({ q, evidence, trace, retrieval }))
      // Isolate per-question failures: a single question whose retrieval throws (an Exa outage
      // that outlived its retries, a classify error) must not abort the parallel fan-out and kill
      // every other question (issue #70). Degrade it to no evidence — with a trace that SAYS why,
      // upholding the transparency principle — so the claim still resolves and the run finishes.
      .catch((err: unknown) => ({
        q,
        evidence: [] as EvidenceItem[],
        trace: {
          hydePassage: "",
          searchQueries: [],
          gatherSummary: `Retrieval failed: ${err instanceof Error ? err.message : String(err)}`,
        } satisfies QuestionTrace,
        retrieval: { searches: 0, failures: 0 } as RetrievalOutcome,
      })),
  );

  // Roll the per-question search tallies up to a run-level total so a wholesale retrieval outage
  // can be told apart from a genuine de-novo dead end (#100).
  const runRetrieval: RetrievalOutcome = { searches: 0, failures: 0 };

  for await (const { q, evidence, trace, retrieval } of asCompleted(tasks)) {
    runRetrieval.searches += retrieval.searches;
    runRetrieval.failures += retrieval.failures;
    if (retrieval.lastError) runRetrieval.lastError = retrieval.lastError;

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

  // 4b. Wholesale-retrieval-failure guard (#100). Per-question search failures are swallowed (#70)
  // so one flaky query can't abort the run — but when EVERY search in the run errored (Exa credits
  // exhausted, key revoked), the graph degrades to all-NEI for a reason that has nothing to do with
  // the web lacking answers. Surface that distinctly so an empty graph + a wall of "not enough
  // evidence" isn't mistaken for a genuine de-novo dead end. Only the all-failing case fires here.
  if (runRetrieval.searches > 0 && runRetrieval.failures === runRetrieval.searches) {
    yield { type: "warning", message: retrievalFailureMessage(runRetrieval.lastError) };
  }

  // 5. Finale: aggregate to the source-text verdict (in claim order), with the support
  // tally. Relevance-dropped claims are excluded from the aggregate and the "of N" — they
  // were never checked — but counted separately so the UI can show "· 3 dropped".
  const checked = claims.filter((c) => !isRelevanceDropped(c));
  const verdicts = checked.map((c) => verdictByClaim.get(c.id) ?? "nei");
  const tally = tallyClaims(verdicts, claims.length - checked.length);
  // Weight the document verdict by each claim's load-bearingness (ADR 0007) so a stray
  // low-relevance claim can't flip it; cherrypicking needs both sides substantial.
  const weighted = checked.map((c) => ({
    verdict: verdictByClaim.get(c.id) ?? "nei",
    relevanceScore: c.relevanceScore,
  }));
  yield { type: "source_verdict", verdict: sourceVerdict(weighted), tally };
  yield { type: "done" };
}

/**
 * The user-facing message for a whole-run retrieval outage (#100). Names the failure as retrieval
 * (not the verdict logic), folds in one representative provider error, and warns that the verdicts
 * below are unreliable — every claim fell back to NEI on empty input, not on a real dead end.
 */
export function retrievalFailureMessage(lastError?: string): string {
  const detail = lastError ? ` Last error: ${lastError}.` : "";
  return `Retrieval is failing — every web search this run errored, so no evidence could be gathered.${detail} The verdicts below are unreliable: with nothing retrieved, every claim falls back to "not enough evidence". Check the search provider's key and credit, then re-run.`;
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
