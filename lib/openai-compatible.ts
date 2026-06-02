import OpenAI from "openai";
import {
  isReasoningModel,
  REASONING_TOKEN_RESERVE,
  supportsTemperature,
  type RunConfig,
} from "./run-config";
import { askJSONWithRepair, type JSONOpts } from "./ask-json";
import type { AskOpts, ReasoningProvider, ToolLoopOpts, ToolLoopResult } from "./anthropic";

// OpenAI-compatible reasoning provider (ADR 0004). One adapter for every backend that speaks the
// OpenAI /chat/completions format — Gemini, OpenAI, Groq, OpenRouter, Together, DeepSeek, or a
// local server. The base URL, model, and key are resolved by createReasoner from the selected
// model's registry entry and passed in here, so this stays a pure adapter (no env reading).
//
// It returns the SAME `ReasoningProvider` interface as createAnthropic — askText / askJSON /
// askWithTools — so the pipeline (`deps.ask`) is unchanged. The agentic gather loop is translated
// into OpenAI tool-calling, so the backend/model MUST support function calling.

/** Where to send requests: resolved by createReasoner from the model registry + env keys. */
export interface OpenAICompatTarget {
  baseURL: string;
  apiKey: string;
  model: string;
}

export function createOpenAICompatible(
  config: RunConfig,
  target: OpenAICompatTarget,
): ReasoningProvider {
  const client = new OpenAI({ apiKey: target.apiKey, baseURL: target.baseURL });
  const model = target.model;
  // Reasoning models (gpt-5.x) reject a custom temperature; omit it for those. Gemini accepts it.
  const temperature = supportsTemperature(config.model) ? config.temperature : undefined;

  // DeepSeek V4 reasons before answering and bills the reasoning against max_tokens. Add a reserve
  // on top of the caller's answer budget (mirrors anthropic.ts) and ask for high effort, so a tight
  // per-stage budget can't be entirely consumed by reasoning (which leaves content === "").
  const reasoning = isReasoningModel(config.model);
  const reasoningParams = reasoning ? ({ reasoning_effort: "high" } as const) : {};
  const outputBudget = (answerTokens: number) =>
    reasoning ? answerTokens + REASONING_TOKEN_RESERVE : answerTokens;

  function buildMessages(
    prompt: string,
    system?: string,
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    if (system) messages.push({ role: "system", content: system });
    messages.push({ role: "user", content: prompt });
    return messages;
  }

  async function askText(prompt: string, opts: AskOpts = {}): Promise<string> {
    const resp = await client.chat.completions.create({
      model,
      messages: buildMessages(prompt, opts.system),
      max_tokens: outputBudget(opts.maxTokens ?? 1024),
      ...(temperature !== undefined ? { temperature } : {}),
      ...reasoningParams,
    });
    return resp.choices[0]?.message?.content ?? "";
  }

  async function askJSON<T>(prompt: string, opts: JSONOpts = {}): Promise<T> {
    return askJSONWithRepair<T>(askText, prompt, opts);
  }

  async function askWithTools(prompt: string, opts: ToolLoopOpts): Promise<ToolLoopResult> {
    const messages = buildMessages(prompt, opts.system);
    // The pipeline defines tools in the Anthropic shape ({ name, description, input_schema }).
    // Translate each into the OpenAI function-tool envelope so the same SEARCH_TOOL works here.
    const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = opts.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description ?? undefined,
        parameters: (t.input_schema ?? {}) as Record<string, unknown>,
      },
    }));
    const toolCalls: { name: string; input: unknown }[] = [];
    let steps = 0;
    let text = "";

    while (steps < opts.maxSteps) {
      steps++;
      const resp = await client.chat.completions.create({
        model,
        messages,
        tools,
        max_tokens: outputBudget(opts.maxTokens ?? 1024),
        ...(temperature !== undefined ? { temperature } : {}),
        ...reasoningParams,
      });
      const msg = resp.choices[0]?.message;
      if (!msg) break;
      // Echo the assistant turn (carrying any tool_calls) so the follow-up tool messages attach.
      messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
      const calls = msg.tool_calls ?? [];
      if (calls.length === 0) {
        text = msg.content ?? "";
        break;
      }
      for (const call of calls) {
        if (call.type !== "function") continue;
        const input = safeParseArgs(call.function.arguments);
        toolCalls.push({ name: call.function.name, input });
        const out = await opts.onTool(call.function.name, input);
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(out) });
      }
    }

    return { text, toolCalls, steps };
  }

  return { askText, askJSON, askWithTools };
}

/** Tool-call arguments arrive as a JSON string; a malformed one degrades to an empty object. */
function safeParseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}
