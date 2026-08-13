import { streamPipeline } from "@/lib/pipeline/stream";
import { createReasoner } from "@/lib/reasoner";
import { createSearchProvider } from "@/lib/search";
import { createReranker } from "@/lib/pipeline/rerank";
import { createFactCheckLookup } from "@/lib/factcheck";
import { parseConfig, MAX_DEPTH_HOPS, DEPTH_LINKS_PER_SOURCE } from "@/lib/run-config";
import { apiRateLimiter, clientIp } from "@/lib/rate-limit";
import { friendlyProviderError } from "@/lib/provider-errors";

// The pipeline calls the LLM gateway + Exa, so it must run on the Node runtime and is
// inherently dynamic (never cached). It streams events as NDJSON so the client can
// build the evidence graph live. The request body carries both the source text and a
// per-run config (model / temperature / thinking / optional user API keys).
export const runtime = "nodejs";
export const maxDuration = 60;

// A question's retrieved evidence is emitted as individual events, but they otherwise flush in
// one tight burst the moment the question resolves — so the graph lurches in blocks. Pace just
// the evidence events apart by a small delay so the live build reads as a calm one-at-a-time
// drip (#9), which also turns the radial view's per-burst reflow into a series of small tweens.
// Only evidence events are staggered; every other event passes through immediately.
const EVIDENCE_STAGGER_MS = 80;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function POST(request: Request) {
  // Per-IP rate limit (in-memory, per-instance). A check kicks off a heavy fan-out, so this
  // blunts accidental hammering before any work starts. The provider's hard-spend cap is the
  // real ceiling (see lib/rate-limit.ts).
  const rl = apiRateLimiter.check(clientIp(request));
  if (!rl.ok) {
    return Response.json(
      { error: "Too many requests — you're starting checks faster than allowed. Wait a moment." },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 1000) / 1000)) },
      },
    );
  }

  let body: { text?: unknown; config?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { text } = body;
  if (typeof text !== "string" || text.trim().length === 0) {
    return Response.json({ error: "Body must include non-empty 'text'." }, { status: 400 });
  }
  const source = text.trim();

  // Validate the run config and build the per-request deps. A bad model/temperature or a
  // missing API key (no user key and no server env fallback) is a 400 with a clear message,
  // surfaced before we open the stream.
  let deps;
  try {
    const config = parseConfig(body.config);
    const searchProvider = createSearchProvider({
      exaKey: config.exaKey,
      numResults: config.maxSources,
      maxChars: config.maxChars,
      deepSearch: config.deepSearch,
      category: config.category,
      preferFresh: config.preferFresh,
      linksPerSource: DEPTH_LINKS_PER_SOURCE,
    });
    deps = {
      ask: createReasoner(config),
      search: searchProvider.search,
      maxClaims: config.maxClaims,
      maxQuestions: config.maxQuestions,
      // Opt-in depth mode (#depth): walk each claim toward its origin via link-following instead of
      // the breadth fan-out. Built only when the flag is on AND the backend can follow links;
      // absent otherwise, so the default run keeps the breadth gather.
      ...(config.depthMode && searchProvider.fetchSource
        ? { depth: { fetchSource: searchProvider.fetchSource, maxHops: MAX_DEPTH_HOPS } }
        : {}),
      // Opt-in embedding re-rank (#57). Built only when the flag is on AND a Cohere key resolves;
      // absent otherwise, so the pipeline keeps its no-embeddings de-novo path by default.
      ...(config.rerank
        ? { rerank: createReranker({ cohereKey: config.cohereKey }) ?? undefined }
        : {}),
      // Opt-in fact-check short-circuit. Built only when the flag is on, so leaving it off
      // (the default) means `factCheck` is absent and the pipeline runs fully de novo. A
      // flag-on-but-no-key run throws here and surfaces as a 400, like the other keys.
      ...(config.factCheckShortCircuit
        ? { factCheck: createFactCheckLookup({ apiKey: config.googleFactCheckKey }) }
        : {}),
    };
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "Invalid run configuration" },
      { status: 400 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        for await (const event of streamPipeline(source, deps)) {
          send(event);
          if (event.type === "evidence") await sleep(EVIDENCE_STAGGER_MS);
        }
      } catch (err) {
        console.error("[/api/check]", err);
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
