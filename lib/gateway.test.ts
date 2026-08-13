import { describe, it, expect, vi, beforeEach } from "vitest";
import { REASONING_TOKEN_RESERVE, type RunConfig } from "./run-config";
import type { ToolDef } from "./reasoner-types";

const createMock = vi.fn();
const ctorMock = vi.fn();

vi.mock("openai", () => ({
  default: class FakeOpenAI {
    chat = { completions: { create: createMock } };
    constructor(opts: unknown) {
      ctorMock(opts);
    }
  },
}));

import { createGateway } from "./gateway";

const baseConfig: RunConfig = {
  model: "google/gemini-2.5-flash-lite",
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
  depthMode: false,
};

const TARGET = {
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: "sk-or-key",
  model: "google/gemini-2.5-flash-lite",
};

const SEARCH_TOOL: ToolDef = {
  name: "search_evidence",
  description: "Search the web.",
  input_schema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  },
};

/** A finished (no-tool) chat completion. */
function textResp(content: string | null) {
  return { choices: [{ message: { role: "assistant", content, tool_calls: undefined } }] };
}

/** A chat completion that requests one function tool call. */
function toolResp(id: string, name: string, args: string) {
  return {
    choices: [
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [{ id, type: "function", function: { name, arguments: args } }],
        },
      },
    ],
  };
}

beforeEach(() => {
  createMock.mockReset();
  ctorMock.mockReset();
});

describe("createGateway", () => {
  it("constructs the client with the target's base URL and key", () => {
    createGateway(baseConfig, TARGET);
    expect(ctorMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "sk-or-key", baseURL: TARGET.baseURL }),
    );
  });

  it("askText sends system+user messages and returns the content", async () => {
    createMock.mockResolvedValue(textResp("the answer"));
    const out = await createGateway(baseConfig, TARGET).askText("the question", {
      system: "sys",
    });
    expect(out).toBe("the answer");
    const body = createMock.mock.calls[0][0];
    expect(body.model).toBe("google/gemini-2.5-flash-lite");
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "the question" },
    ]);
  });

  it("askJSON parses JSON out of a fenced response", async () => {
    createMock.mockResolvedValue(textResp('```json\n{"stance":"refutes"}\n```'));
    expect(await createGateway(baseConfig, TARGET).askJSON("q")).toEqual({
      stance: "refutes",
    });
  });

  it("askWithTools translates tools, runs the loop, feeds the result back, and returns the final text", async () => {
    createMock
      .mockResolvedValueOnce(toolResp("call_1", "search_evidence", '{"query":"el mencho death"}'))
      .mockResolvedValueOnce(textResp("found a wire report"));
    const onTool = vi.fn().mockResolvedValue([{ url: "https://wire/x" }]);

    const result = await createGateway(baseConfig, TARGET).askWithTools("go", {
      system: "gather",
      tools: [SEARCH_TOOL],
      onTool,
      maxSteps: 4,
      maxTokens: 600,
    });

    // The JSON-schema tool shape was translated into the OpenAI function-tool envelope.
    const firstBody = createMock.mock.calls[0][0];
    expect(firstBody.tools).toEqual([
      {
        type: "function",
        function: {
          name: "search_evidence",
          description: "Search the web.",
          parameters: SEARCH_TOOL.input_schema,
        },
      },
    ]);

    // The tool was executed with the parsed arguments, and its result fed back as a tool message.
    expect(onTool).toHaveBeenCalledWith("search_evidence", { query: "el mencho death" });
    const secondBody = createMock.mock.calls[1][0];
    expect(secondBody.messages).toContainEqual({
      role: "tool",
      tool_call_id: "call_1",
      content: JSON.stringify([{ url: "https://wire/x" }]),
    });

    expect(result.text).toBe("found a wire report");
    expect(result.toolCalls).toEqual([
      { name: "search_evidence", input: { query: "el mencho death" } },
    ]);
    expect(result.steps).toBe(2);
  });

  it("askWithTools stops at maxSteps when the model keeps calling tools", async () => {
    createMock.mockResolvedValue(toolResp("c", "search_evidence", "{}"));
    const onTool = vi.fn().mockResolvedValue([]);
    const result = await createGateway(baseConfig, TARGET).askWithTools("go", {
      tools: [SEARCH_TOOL],
      onTool,
      maxSteps: 2,
    });
    expect(result.steps).toBe(2);
    expect(onTool).toHaveBeenCalledTimes(2);
  });
});

describe("createGateway unified reasoning handling", () => {
  // One gateway means no per-provider thinking knowledge here (ADR 0012): headroom is reserved on
  // every call because reasoning tokens bill against max_tokens on models that reason by default
  // (empty-content crash, #102), and the thinking toggle maps to the standard reasoning_effort.

  it("always reserves reasoning headroom on top of the answer budget", async () => {
    createMock.mockResolvedValue(textResp("hi"));
    await createGateway(baseConfig, TARGET).askText("q", { maxTokens: 300 });
    const body = createMock.mock.calls[0][0];
    expect(body.max_tokens).toBe(300 + REASONING_TOKEN_RESERVE);
  });

  it("thinking off: sends no reasoning_effort (the model's own default stands)", async () => {
    createMock.mockResolvedValue(textResp("hi"));
    await createGateway(baseConfig, TARGET).askText("q");
    expect(createMock.mock.calls[0][0]).not.toHaveProperty("reasoning_effort");
  });

  it("thinking on: asks for medium effort", async () => {
    createMock.mockResolvedValue(textResp("hi"));
    await createGateway({ ...baseConfig, thinking: true }, TARGET).askText("q");
    expect(createMock.mock.calls[0][0].reasoning_effort).toBe("medium");
  });

  it("sends temperature for a curated temperature-capable model", async () => {
    createMock.mockResolvedValue(textResp("hi"));
    await createGateway({ ...baseConfig, temperature: 0.5 }, TARGET).askText("q");
    expect(createMock.mock.calls[0][0].temperature).toBe(0.5);
  });

  it("omits temperature for a curated reasoning model", async () => {
    createMock.mockResolvedValue(textResp("hi"));
    const cfg = { ...baseConfig, model: "deepseek/deepseek-v4-flash", temperature: 0.5 };
    await createGateway(cfg, { ...TARGET, model: cfg.model }).askText("q");
    expect(createMock.mock.calls[0][0]).not.toHaveProperty("temperature");
  });

  it("omits temperature for an uncurated custom model (capabilities unknown)", async () => {
    createMock.mockResolvedValue(textResp("hi"));
    const cfg = { ...baseConfig, model: "mistralai/mistral-large-3", temperature: 0.5 };
    await createGateway(cfg, { ...TARGET, model: cfg.model }).askText("q");
    expect(createMock.mock.calls[0][0]).not.toHaveProperty("temperature");
  });

  it("applies reserve and effort on the tool-calling loop too", async () => {
    createMock.mockResolvedValue(textResp("done"));
    await createGateway({ ...baseConfig, thinking: true }, TARGET).askWithTools("go", {
      tools: [SEARCH_TOOL],
      onTool: vi.fn(),
      maxSteps: 1,
      maxTokens: 600,
    });
    const body = createMock.mock.calls[0][0];
    expect(body.max_tokens).toBe(600 + REASONING_TOKEN_RESERVE);
    expect(body.reasoning_effort).toBe("medium");
  });
});
