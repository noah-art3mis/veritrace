import { describe, it, expect, vi, beforeEach } from "vitest";
import type { PipelineEvent } from "@/lib/pipeline/events";
import { DEFAULT_CHARS } from "@/lib/run-config";

const { streamPipeline } = vi.hoisted(() => ({ streamPipeline: vi.fn() }));
const { createAnthropic } = vi.hoisted(() => ({ createAnthropic: vi.fn() }));
const { createExaSearch } = vi.hoisted(() => ({ createExaSearch: vi.fn() }));
vi.mock("@/lib/pipeline/stream", () => ({ streamPipeline }));
vi.mock("@/lib/anthropic", () => ({ createAnthropic }));
vi.mock("@/lib/exa", () => ({ createExaSearch }));

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
  createAnthropic.mockReset().mockReturnValue({ askText: vi.fn(), askJSON: vi.fn() });
  createExaSearch.mockReset().mockReturnValue(vi.fn());
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

  it("returns 400 when no API key can be resolved (createAnthropic throws)", async () => {
    createAnthropic.mockImplementation(() => {
      throw new Error("ANTHROPIC_API_KEY is not set (and no key was provided)");
    });
    const res = await POST(post(JSON.stringify({ text: "hi" })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/ANTHROPIC_API_KEY/);
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
      post(JSON.stringify({ text: "hi", config: { model: "claude-opus-4-8", temperature: 0.3 } })),
    );
    expect(createAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-opus-4-8", temperature: 0.3 }),
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
