import OpenAI from "openai";
import { REASONING_TOKEN_RESERVE, supportsTemperature, type RunConfig } from "./run-config";
import { askJSONWithRepair, type JSONOpts } from "./ask-json";
import type { AskOpts, ReasoningProvider, ToolLoopOpts, ToolLoopResult } from "./reasoner-types";

// The one reasoning adapter (ADR 0012): every model — Anthropic, OpenAI, Gemini, DeepSeek,
// GLM, Kimi, or any custom slug — is reached through a single OpenAI-compatible gateway
// (OpenRouter by default; see lib/reasoner.ts). The gateway translates the standard params
// into each provider's dialect, so this adapter carries NO per-provider knowledge:
//
//   - Reasoning headroom is added to every call's answer budget unconditionally. We can't know
//     which models reason by default, reasoning tokens bill against max_tokens (empty-content
//     crash, #102), and a higher cap costs nothing on models that don't reason.
//   - The run's `thinking` toggle maps to reasoning_effort "medium"; off sends nothing, leaving
//     the model's own default. We never send "none" — some models can't disable reasoning and
//     reject the request, which is exactly the normalization trap this design retires.
//   - Temperature is sent only for curated models verified to accept it (noTemperature unset);
//     custom models omit it, since reasoning models reject the parameter.
//
// The agentic gather loop is translated into OpenAI tool-calling, so the selected model MUST
// support function calling.

/** Where to send requests: resolved by createReasoner from env + the run config. */
export interface GatewayTarget {
  baseURL: string;
  apiKey: string;
  model: string;
}

export function createGateway(config: RunConfig, target: GatewayTarget): ReasoningProvider {
  const client = new OpenAI({ apiKey: target.apiKey, baseURL: target.baseURL });
  const model = target.model;
  const temperature = supportsTemperature(config.model) ? config.temperature : undefined;
  const reasoningParams: { reasoning_effort?: "medium" } = config.thinking
    ? { reasoning_effort: "medium" }
    : {};
  const outputBudget = (answerTokens: number) => answerTokens + REASONING_TOKEN_RESERVE;

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
    // The pipeline defines tools in the JSON-schema shape ({ name, description, input_schema }).
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
