import { createReasoner } from "@/lib/reasoner";
import { createSearchProvider } from "@/lib/search";
import { createReranker } from "@/lib/pipeline/rerank";
import { parseConfig } from "@/lib/run-config";
import { generateQuestions } from "@/lib/pipeline/questions";
import { resolveQuestion, rationaleFor } from "@/lib/pipeline/resolve";
import { claimVerdict } from "@/lib/pipeline/verdict";
import type { ClaimItem, EvidenceItem } from "@/lib/graph-types";
import type { PipelineEvent } from "@/lib/pipeline/events";
import { apiRateLimiter, clientIp } from "@/lib/rate-limit";
import { friendlyProviderError } from "@/lib/provider-errors";

// Re-resolve ONE claim on demand (#33). When the user re-includes a claim the relevance filter
// had dropped, the client sends just that claim here and we run the same questions → gather →
// verdict path the full pipeline uses, streaming the same events so they merge straight into the
// existing graph via applyEvent. The source-level verdict/tally is recomputed client-side once
// this claim resolves (this endpoint only knows the one claim).
export const runtime = "nodejs";
export const maxDuration = 60;

const EVIDENCE_STAGGER_MS = 80;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface ClaimInput {
  id: string;
  text: string;
  date?: string;
}

function isClaimInput(v: unknown): v is ClaimInput {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return typeof c.id === "string" && typeof c.text === "string" && c.text.trim().length > 0;
}

export async function POST(request: Request) {
  const rl = apiRateLimiter.check(clientIp(request));
  if (!rl.ok) {
    return Response.json(
      { error: "Too many requests — wait a moment before re-including another claim." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 1000) / 1000)) },
      },
    );
  }

  let body: { claim?: unknown; config?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isClaimInput(body.claim)) {
    return Response.json(
      { error: "Body must include a 'claim' with an id and non-empty text." },
      { status: 400 },
    );
  }
  const input = body.claim;

  let deps;
  try {
    const config = parseConfig(body.config);
    deps = {
      ask: createReasoner(config),
      search: createSearchProvider({
        exaKey: config.exaKey,
        numResults: config.maxSources,
        maxChars: config.maxChars,
        deepSearch: config.deepSearch,
        category: config.category,
        preferFresh: config.preferFresh,
      }).search,
      maxClaims: config.maxClaims,
      maxQuestions: config.maxQuestions,
      // Opt-in embedding re-rank (#57) — same gating as /api/check.
      ...(config.rerank
        ? { rerank: createReranker({ cohereKey: config.cohereKey }) ?? undefined }
        : {}),
    };
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Invalid run configuration" },
      { status: 400 },
    );
  }

  // The re-included claim: searchable by definition (the user overrode the relevance drop).
  const claim: ClaimItem = {
    id: input.id,
    text: input.text,
    checkable: true,
    checkworthy: true,
    relevant: true,
    relevanceScore: 1,
    date: input.date,
    verdict: null,
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: PipelineEvent) =>
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        const questions = await generateQuestions(claim, deps.ask, deps.maxQuestions);
        for (const q of questions) send({ type: "question", question: q });

        // No questions → the question-less NEI rule, same as the main pipeline.
        if (questions.length === 0) {
          const verdict = claimVerdict(claim, []);
          send({
            type: "claim_verdict",
            id: claim.id,
            verdict,
            rationale: rationaleFor(claim, verdict, []),
          });
          return;
        }

        for (const q of questions) send({ type: "question_status", id: q.id, status: "searching" });

        // Resolve each question, isolating failures (a thrown question degrades to empty, with a
        // trace that says why) — the same resilience as streamPipeline (#70).
        const resolved = await Promise.all(
          questions.map((q) =>
            resolveQuestion(claim, q, deps)
              .then(({ evidence, trace }) => ({ q, evidence, trace }))
              .catch((err: unknown) => ({
                q,
                evidence: [] as EvidenceItem[],
                trace: {
                  hydePassage: "",
                  searchQueries: [],
                  gatherSummary: `Retrieval failed: ${err instanceof Error ? err.message : String(err)}`,
                },
              })),
          ),
        );

        const bucket: EvidenceItem[] = [];
        for (const { q, evidence, trace } of resolved) {
          send({ type: "question_status", id: q.id, status: "answered" });
          send({ type: "question_trace", id: q.id, trace });
          for (const e of evidence) {
            send({ type: "evidence", evidence: e });
            await sleep(EVIDENCE_STAGGER_MS);
          }
          bucket.push(...evidence);
        }

        const verdict = claimVerdict(claim, bucket);
        send({
          type: "claim_verdict",
          id: claim.id,
          verdict,
          rationale: rationaleFor(claim, verdict, bucket),
        });
      } catch (err) {
        console.error("[/api/resolve-claim]", err);
        send({ type: "error", message: friendlyProviderError(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
