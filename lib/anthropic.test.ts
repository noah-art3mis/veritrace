import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RunConfig } from "./run-config";
import { THINKING_BUDGET } from "./run-config";

const createMock = vi.fn();
const ctorMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: class FakeAnthropic {
      messages = { create: createMock };
      constructor(opts: unknown) {
        ctorMock(opts);
      }
    },
  };
});

import { createAnthropic } from "./anthropic";

const baseConfig: RunConfig = {
  model: "claude-sonnet-4-6",
  temperature: 0,
  thinking: false,
  maxClaims: 5,
  maxQuestions: 2,
  maxSources: 2,
  maxChars: 6000,
  deepSearch: false,
  category: "",
  preferFresh: false,
  factCheckShortCircuit: false,
  rerank: false,
};

beforeEach(() => {
  createMock.mockReset();
  ctorMock.mockReset();
  process.env.ANTHROPIC_API_KEY = "env-key";
});

function reply(...blocks: Array<{ type: string; text?: string }>) {
  createMock.mockResolvedValue({ content: blocks, stop_reason: "end_turn" });
}

/** Queue one assistant turn that requests a tool call. */
function toolUseReply(id: string, name: string, input: unknown) {
  createMock.mockResolvedValueOnce({
    content: [{ type: "tool_use", id, name, input }],
    stop_reason: "tool_use",
  });
}

/** Queue one final assistant turn that ends the loop with text. */
function textReply(text: string) {
  createMock.mockResolvedValueOnce({
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
  });
}

function lastRequest() {
  return createMock.mock.calls[0][0];
}

describe("createAnthropic — askText response handling", () => {
  it("concatenates the text blocks of the response", async () => {
    reply({ type: "text", text: "Hello " }, { type: "text", text: "world" });
    expect(await createAnthropic(baseConfig).askText("hi")).toBe("Hello world");
  });

  it("ignores non-text content blocks (e.g. thinking, tool_use)", async () => {
    reply(
      { type: "thinking", text: "scratch" },
      { type: "text", text: "keep" },
      { type: "tool_use" },
      { type: "text", text: "-this" },
    );
    expect(await createAnthropic(baseConfig).askText("hi")).toBe("keep-this");
  });
});

describe("createAnthropic — request body", () => {
  it("forwards the model from config, plus system / max_tokens / messages", async () => {
    reply({ type: "text", text: "ok" });
    await createAnthropic({ ...baseConfig, model: "claude-opus-4-8" }).askText("the prompt", {
      system: "be terse",
      maxTokens: 256,
    });
    const args = lastRequest();
    expect(args.model).toBe("claude-opus-4-8");
    expect(args.system).toBe("be terse");
    expect(args.max_tokens).toBe(256);
    expect(args.messages).toEqual([{ role: "user", content: "the prompt" }]);
  });

  it("defaults max_tokens to 1024 when none is given (thinking off)", async () => {
    reply({ type: "text", text: "ok" });
    await createAnthropic(baseConfig).askText("p");
    expect(lastRequest().max_tokens).toBe(1024);
  });

  it("sends the configured temperature and no thinking block when thinking is off", async () => {
    reply({ type: "text", text: "ok" });
    await createAnthropic({ ...baseConfig, temperature: 0.4 }).askText("p");
    const args = lastRequest();
    expect(args.temperature).toBe(0.4);
    expect(args.thinking).toBeUndefined();
  });

  it("omits temperature for models that deprecated it (e.g. Opus 4.8)", async () => {
    reply({ type: "text", text: "ok" });
    await createAnthropic({ ...baseConfig, model: "claude-opus-4-8", temperature: 0.4 }).askText(
      "p",
    );
    expect(lastRequest().temperature).toBeUndefined();
  });
});

describe("createAnthropic — extended thinking", () => {
  it("omits temperature and sends an enabled thinking block when thinking is on", async () => {
    reply({ type: "text", text: "ok" });
    await createAnthropic({ ...baseConfig, temperature: 0.4, thinking: true }).askText("p");
    const args = lastRequest();
    expect(args.temperature).toBeUndefined();
    expect(args.thinking).toEqual({ type: "enabled", budget_tokens: THINKING_BUDGET });
  });

  it("raises max_tokens above the thinking budget (API requires max_tokens > budget)", async () => {
    reply({ type: "text", text: "ok" });
    await createAnthropic({ ...baseConfig, thinking: true }).askText("p", { maxTokens: 600 });
    expect(lastRequest().max_tokens).toBe(THINKING_BUDGET + 600);
  });
});

describe("createAnthropic — API key resolution", () => {
  it("prefers the user-supplied key over the env key", async () => {
    reply({ type: "text", text: "ok" });
    await createAnthropic({ ...baseConfig, anthropicKey: "user-key" }).askText("p");
    expect(ctorMock).toHaveBeenCalledWith({ apiKey: "user-key" });
  });

  it("falls back to the env key when no user key is given", async () => {
    reply({ type: "text", text: "ok" });
    await createAnthropic(baseConfig).askText("p");
    expect(ctorMock).toHaveBeenCalledWith({ apiKey: "env-key" });
  });

  it("throws when neither a user key nor an env key is present", () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => createAnthropic(baseConfig)).toThrow(/ANTHROPIC_API_KEY/);
  });
});

describe("createAnthropic — askJSON parsing", () => {
  const ask = () => createAnthropic(baseConfig);

  it("parses a bare JSON array", async () => {
    reply({ type: "text", text: '[{"a":1}]' });
    expect(await ask().askJSON("p")).toEqual([{ a: 1 }]);
  });

  it("strips a ```json fenced code block", async () => {
    reply({ type: "text", text: '```json\n[{"a":1}]\n```' });
    expect(await ask().askJSON("p")).toEqual([{ a: 1 }]);
  });

  it("strips an unlabeled ``` fence", async () => {
    reply({ type: "text", text: '```\n{"a":2}\n```' });
    expect(await ask().askJSON("p")).toEqual({ a: 2 });
  });

  it("extracts the JSON payload from surrounding prose", async () => {
    reply({ type: "text", text: 'Here is the result: [{"a":1},{"a":2}] — hope that helps!' });
    expect(await ask().askJSON("p")).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("tolerates leading/trailing whitespace around clean JSON", async () => {
    reply({ type: "text", text: '   \n {"ok":true} \n  ' });
    expect(await ask().askJSON("p")).toEqual({ ok: true });
  });

  it("throws an informative error when no JSON can be recovered", async () => {
    reply({ type: "text", text: "I could not complete that request." });
    await expect(ask().askJSON("p")).rejects.toThrow(/Could not parse JSON/);
  });
});

describe("createAnthropic — askWithTools loop", () => {
  const TOOLS = [
    {
      name: "search_evidence",
      description: "search the web",
      input_schema: { type: "object" as const, properties: { query: { type: "string" } } },
    },
  ];

  it("runs the requested tool, feeds the result back, and returns the final text", async () => {
    toolUseReply("t1", "search_evidence", { query: "did X happen?" });
    textReply("found enough");

    const onTool = vi.fn().mockResolvedValue([{ domain: "bbc.com" }]);
    const result = await createAnthropic(baseConfig).askWithTools("resolve this", {
      system: "gather",
      tools: TOOLS,
      onTool,
      maxSteps: 4,
    });

    expect(onTool).toHaveBeenCalledWith("search_evidence", { query: "did X happen?" });
    expect(result.text).toBe("found enough");
    expect(result.toolCalls).toEqual([
      { name: "search_evidence", input: { query: "did X happen?" } },
    ]);

    // The second request must carry the assistant tool_use turn + a tool_result user turn.
    const secondMessages = createMock.mock.calls[1][0].messages;
    const toolResult = secondMessages[2].content[0];
    expect(secondMessages[1].role).toBe("assistant");
    expect(toolResult).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
    expect(JSON.parse(toolResult.content)).toEqual([{ domain: "bbc.com" }]);
  });

  it("forwards the tools array on every request", async () => {
    textReply("no search needed");
    await createAnthropic(baseConfig).askWithTools("p", {
      tools: TOOLS,
      onTool: vi.fn(),
      maxSteps: 4,
    });
    expect(lastRequest().tools).toEqual(TOOLS);
  });

  it("stops at maxSteps even if the model keeps requesting tools", async () => {
    // The model never yields — every turn asks for another search.
    createMock.mockResolvedValue({
      content: [{ type: "tool_use", id: "t", name: "search_evidence", input: { query: "again" } }],
      stop_reason: "tool_use",
    });
    const onTool = vi.fn().mockResolvedValue([]);

    const result = await createAnthropic(baseConfig).askWithTools("p", {
      tools: TOOLS,
      onTool,
      maxSteps: 3,
    });

    expect(createMock).toHaveBeenCalledTimes(3);
    expect(onTool).toHaveBeenCalledTimes(3);
    expect(result.steps).toBe(3);
  });
});
