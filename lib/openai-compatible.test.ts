import { describe, it, expect, vi, beforeEach } from "vitest";
import { REASONING_TOKEN_RESERVE, type RunConfig } from "./run-config";
import type { ToolDef } from "./anthropic";

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

import { createOpenAICompatible } from "./openai-compatible";

const baseConfig: RunConfig = {
  model: "gemini-2.5-flash-lite",
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

const TARGET = {
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  apiKey: "gem-key",
  model: "gemini-2.5-flash-lite",
};

const deepseekConfig: RunConfig = { ...baseConfig, model: "deepseek-v4-flash", temperature: 0.5 };

const DEEPSEEK_TARGET = {
  baseURL: "https://api.deepseek.com",
  apiKey: "ds-key",
  model: "deepseek-v4-flash",
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

describe("createOpenAICompatible", () => {
  it("constructs the client with the target's base URL and key", () => {
    createOpenAICompatible(baseConfig, TARGET);
    expect(ctorMock).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "gem-key", baseURL: TARGET.baseURL }),
    );
  });

  it("askText sends system+user messages and returns the content", async () => {
    createMock.mockResolvedValue(textResp("the answer"));
    const out = await createOpenAICompatible(baseConfig, TARGET).askText("the question", {
      system: "sys",
    });
    expect(out).toBe("the answer");
    const body = createMock.mock.calls[0][0];
    expect(body.model).toBe("gemini-2.5-flash-lite");
    expect(body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "the question" },
    ]);
  });

  it("askJSON parses JSON out of a fenced response", async () => {
    createMock.mockResolvedValue(textResp('```json\n{"stance":"refutes"}\n```'));
    expect(await createOpenAICompatible(baseConfig, TARGET).askJSON("q")).toEqual({
      stance: "refutes",
    });
  });

  it("askWithTools translates tools, runs the loop, feeds the result back, and returns the final text", async () => {
    createMock
      .mockResolvedValueOnce(toolResp("call_1", "search_evidence", '{"query":"el mencho death"}'))
      .mockResolvedValueOnce(textResp("found a wire report"));
    const onTool = vi.fn().mockResolvedValue([{ url: "https://wire/x" }]);

    const result = await createOpenAICompatible(baseConfig, TARGET).askWithTools("go", {
      system: "gather",
      tools: [SEARCH_TOOL],
      onTool,
      maxSteps: 4,
      maxTokens: 600,
    });

    // The Anthropic tool shape was translated into the OpenAI function-tool envelope.
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
    const result = await createOpenAICompatible(baseConfig, TARGET).askWithTools("go", {
      tools: [SEARCH_TOOL],
      onTool,
      maxSteps: 2,
    });
    expect(result.steps).toBe(2);
    expect(onTool).toHaveBeenCalledTimes(2);
  });
});

describe("createOpenAICompatible with a reasoning model (DeepSeek)", () => {
  // DeepSeek V4 reasons by default and the reasoning_tokens count against max_tokens, so the answer
  // budget must carry a reserve on top — mirroring the Anthropic thinking path (anthropic.ts).

  it("askText reserves reasoning tokens on top of the answer budget and asks for high effort", async () => {
    createMock.mockResolvedValue(textResp("hi"));
    await createOpenAICompatible(deepseekConfig, DEEPSEEK_TARGET).askText("q", { maxTokens: 300 });
    const body = createMock.mock.calls[0][0];
    expect(body.max_tokens).toBe(300 + REASONING_TOKEN_RESERVE);
    expect(body.reasoning_effort).toBe("high");
  });

  it("omits temperature for a reasoning model even when the config carries one", async () => {
    createMock.mockResolvedValue(textResp("hi"));
    await createOpenAICompatible(deepseekConfig, DEEPSEEK_TARGET).askText("q");
    const body = createMock.mock.calls[0][0];
    expect(body).not.toHaveProperty("temperature");
  });

  it("applies the reserve and effort on the tool-calling loop too", async () => {
    createMock.mockResolvedValue(textResp("done"));
    await createOpenAICompatible(deepseekConfig, DEEPSEEK_TARGET).askWithTools("go", {
      tools: [SEARCH_TOOL],
      onTool: vi.fn(),
      maxSteps: 1,
      maxTokens: 600,
    });
    const body = createMock.mock.calls[0][0];
    expect(body.max_tokens).toBe(600 + REASONING_TOKEN_RESERVE);
    expect(body.reasoning_effort).toBe("high");
  });

  it("leaves a non-reasoning model unchanged: no reserve, no effort, temperature sent", async () => {
    createMock.mockResolvedValue(textResp("hi"));
    await createOpenAICompatible({ ...baseConfig, temperature: 0.5 }, TARGET).askText("q", {
      maxTokens: 300,
    });
    const body = createMock.mock.calls[0][0];
    expect(body.max_tokens).toBe(300);
    expect(body.reasoning_effort).toBeUndefined();
    expect(body.temperature).toBe(0.5);
  });
});

describe("createOpenAICompatible with an optional-thinking model (Gemini 2.5 Flash)", () => {
  // Gemini Flash defaults thinking ON and bills it against max_tokens, starving a tight per-stage
  // budget (empty content / JSON crash). The policy makes thinking an explicit, reserved opt-in:
  // off by default (reasoning_effort "none", the safe floor) and reserved when the run turns it on.
  const flashConfig: RunConfig = { ...baseConfig, model: "gemini-2.5-flash", temperature: 0.5 };
  const FLASH_TARGET = { ...TARGET, model: "gemini-2.5-flash" };

  it("thinking off: forces reasoning_effort 'none', adds no reserve, keeps temperature", async () => {
    createMock.mockResolvedValue(textResp("hi"));
    await createOpenAICompatible({ ...flashConfig, thinking: false }, FLASH_TARGET).askText("q", {
      maxTokens: 300,
    });
    const body = createMock.mock.calls[0][0];
    expect(body.reasoning_effort).toBe("none");
    expect(body.max_tokens).toBe(300);
    expect(body.temperature).toBe(0.5);
  });

  it("thinking on: asks for 'medium' effort and reserves tokens on top of the answer budget", async () => {
    createMock.mockResolvedValue(textResp("hi"));
    await createOpenAICompatible({ ...flashConfig, thinking: true }, FLASH_TARGET).askText("q", {
      maxTokens: 300,
    });
    const body = createMock.mock.calls[0][0];
    expect(body.reasoning_effort).toBe("medium");
    expect(body.max_tokens).toBe(300 + REASONING_TOKEN_RESERVE);
    expect(body.temperature).toBe(0.5);
  });

  it("thinking on applies the reserve and effort on the tool-calling loop too", async () => {
    createMock.mockResolvedValue(textResp("done"));
    await createOpenAICompatible({ ...flashConfig, thinking: true }, FLASH_TARGET).askWithTools(
      "go",
      {
        tools: [SEARCH_TOOL],
        onTool: vi.fn(),
        maxSteps: 1,
        maxTokens: 600,
      },
    );
    const body = createMock.mock.calls[0][0];
    expect(body.reasoning_effort).toBe("medium");
    expect(body.max_tokens).toBe(600 + REASONING_TOKEN_RESERVE);
  });
});
