import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RunConfig } from "./run-config";
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
};

const TARGET = {
  baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  apiKey: "gem-key",
  model: "gemini-2.5-flash-lite",
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
