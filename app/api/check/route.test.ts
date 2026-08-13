import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PipelineEvent } from "@/lib/pipeline/events";
import { DEFAULT_CHARS } from "@/lib/run-config";

const { streamPipeline } = vi.hoisted(() => ({ streamPipeline: vi.fn() }));
const { createReasoner } = vi.hoisted(() => ({ createReasoner: vi.fn() }));
const { createExaSearch, createExaFetch } = vi.hoisted(() => ({
  createExaSearch: vi.fn(),
  createExaFetch: vi.fn(),
}));
// The route is guarded by a module-level rate limiter shared across requests; mock it so the
// suite doesn't drain a real bucket (and so we can drive the reject path explicitly).
const { apiRateLimiter, clientIp } = vi.hoisted(() => ({
  apiRateLimiter: {
    check: vi.fn((): { ok: boolean; retryAfterMs?: number } => ({ ok: true })),
  },
  clientIp: vi.fn(() => "test-ip"),
}));
vi.mock("@/lib/pipeline/stream", () => ({ streamPipeline }));
vi.mock("@/lib/reasoner", () => ({ createReasoner }));
vi.mock("@/lib/exa", () => ({ createExaSearch, createExaFetch }));
vi.mock("@/lib/rate-limit", () => ({ apiRateLimiter, clientIp }));

import { POST } from "./route";

function post(body: string): Request {
  return new Request("http://localhost/api/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
}

async function ndjson(res: Response): Promise<PipelineEvent[]> {
  const text = await res.text();
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

async function* empty() {
  /* no events */
}

beforeEach(() => {
  streamPipeline.mockReset().mockImplementation(empty);
  createReasoner.mockReset().mockReturnValue({
    askText: vi.fn(),
    askJSON: vi.fn(),
    askWithTools: vi.fn(),
  });
  createExaSearch.mockReset().mockReturnValue(vi.fn());
  createExaFetch.mockReset().mockReturnValue(vi.fn());
  apiRateLimiter.check.mockReset().mockReturnValue({ ok: true });
});

describe("POST /api/check rate limiting", () => {
  it("returns 429 with Retry-After when the limiter rejects, before any work", async () => {
    apiRateLimiter.check.mockReturnValue({ ok: false, retryAfterMs: 5000 });
    const res = await POST(post(JSON.stringify({ text: "hi" })));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("5");
    expect((await res.json()).error).toMatch(/too many requests/i);
    expect(streamPipeline).not.toHaveBeenCalled();
  });
});

describe("POST /api/check error mapping", () => {
  it("maps a provider 429 in the stream to readable rate-limit guidance", async () => {
    streamPipeline.mockImplementation(async function* () {
      yield { type: "source", source: { id: "src", text: "hi", verdict: null } };
      throw Object.assign(new Error("429 status code (no body)"), { status: 429 });
    });
    const res = await POST(post(JSON.stringify({ text: "hi" })));
    const events = await ndjson(res);
    const last = events[events.length - 1] as { type: string; message: string };
    expect(last.type).toBe("error");
    expect(last.message).toMatch(/rate-?limit/i);
    expect(last.message).not.toMatch(/no body/i);
  });
});

describe("POST /api/check validation", () => {
  it("rejects a malformed JSON body with 400", async () => {
    const res = await POST(post("not json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid JSON/);
    expect(streamPipeline).not.toHaveBeenCalled();
  });

  it("rejects a missing text field with 400", async () => {
    const res = await POST(post(JSON.stringify({})));
    expect(res.status).toBe(400);
    expect(streamPipeline).not.toHaveBeenCalled();
  });

  it("rejects a non-string text field with 400", async () => {
    const res = await POST(post(JSON.stringify({ text: 42 })));
    expect(res.status).toBe(400);
  });

  it("rejects whitespace-only text with 400", async () => {
    const res = await POST(post(JSON.stringify({ text: "   " })));
    expect(res.status).toBe(400);
    expect(streamPipeline).not.toHaveBeenCalled();
  });
});

describe("POST /api/check config validation", () => {
  it("rejects an unknown model with 400 and does not start the pipeline", async () => {
    const res = await POST(post(JSON.stringify({ text: "hi", config: { model: "gpt-4" } })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/model/i);
    expect(streamPipeline).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range temperature with 400", async () => {
    const res = await POST(post(JSON.stringify({ text: "hi", config: { temperature: 9 } })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/temperature/i);
  });

  it("returns 400 when no API key can be resolved (the reasoner throws)", async () => {
    createReasoner.mockImplementation(() => {
      throw new Error("OPENROUTER_API_KEY is not set (and no gateway key was provided).");
    });
    const res = await POST(post(JSON.stringify({ text: "hi" })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/OPENROUTER_API_KEY/);
  });
});

describe("POST /api/check streaming", () => {
  it("streams pipeline events as NDJSON with the right content type", async () => {
    streamPipeline.mockImplementation(async function* () {
      yield { type: "source", source: { id: "src", text: "hi", verdict: null } };
      yield { type: "done" };
    });

    const res = await POST(post(JSON.stringify({ text: "hi" })));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/x-ndjson");

    const events = await ndjson(res);
    expect(events.map((e) => e.type)).toEqual(["source", "done"]);
  });

  it("trims the source text and threads deps into the pipeline", async () => {
    await POST(post(JSON.stringify({ text: "  padded  " })));
    const [source, deps] = streamPipeline.mock.calls[0];
    expect(source).toBe("padded");
    expect(deps).toMatchObject({ ask: expect.anything(), search: expect.anything() });
  });

  it("builds the model caller from the requested config", async () => {
    await POST(
      post(
        JSON.stringify({
          text: "hi",
          config: { model: "anthropic/claude-opus-5", temperature: 0.3 },
        }),
      ),
    );
    expect(createReasoner).toHaveBeenCalledWith(
      expect.objectContaining({ model: "anthropic/claude-opus-5", temperature: 0.3 }),
    );
  });

  it("forwards a user-supplied Exa key and retrieval config to the search factory", async () => {
    await POST(post(JSON.stringify({ text: "hi", config: { exaKey: "exa-user", maxSources: 4 } })));
    expect(createExaSearch).toHaveBeenCalledWith(
      expect.objectContaining({
        exaKey: "exa-user",
        numResults: 4,
        maxChars: DEFAULT_CHARS,
        deepSearch: false,
        category: "",
        preferFresh: false,
      }),
    );
  });

  it("staggers evidence events but preserves every event and its order", async () => {
    // The route paces evidence apart for a calm one-at-a-time live build (#9). Staggering must
    // not drop or reorder anything — all events arrive, in the order the pipeline yielded them.
    streamPipeline.mockImplementation(async function* () {
      yield { type: "source", source: { id: "src", text: "hi", verdict: null } };
      yield { type: "evidence", evidence: { id: "e1" } };
      yield { type: "evidence", evidence: { id: "e2" } };
      yield { type: "evidence", evidence: { id: "e3" } };
      yield { type: "claim_verdict", id: "c1", verdict: "supported", rationale: "r" };
      yield { type: "done" };
    });

    const res = await POST(post(JSON.stringify({ text: "hi" })));
    const events = await ndjson(res);
    expect(events.map((e) => e.type)).toEqual([
      "source",
      "evidence",
      "evidence",
      "evidence",
      "claim_verdict",
      "done",
    ]);
    expect(events.filter((e) => e.type === "evidence").map((e) => e.evidence.id)).toEqual([
      "e1",
      "e2",
      "e3",
    ]);
  });

  it("converts a mid-stream pipeline failure into a terminal error event, not a crash", async () => {
    streamPipeline.mockImplementation(async function* () {
      yield { type: "source", source: { id: "src", text: "hi", verdict: null } };
      throw new Error("Exa exploded");
    });

    const res = await POST(post(JSON.stringify({ text: "hi" })));
    expect(res.status).toBe(200); // headers already flushed; failure rides the stream
    const events = await ndjson(res);
    expect(events[0].type).toBe("source");
    expect(events[events.length - 1]).toMatchObject({ type: "error", message: "Exa exploded" });
  });
});
