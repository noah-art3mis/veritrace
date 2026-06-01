import OpenAI from "openai";
import type { RunConfig } from "./run-config";
import { parseJSON } from "./parse-json";
import type { AskOpts, ReasoningProvider, ToolLoopOpts, ToolLoopResult } from "./anthropic";

// OpenAI-compatible reasoning provider (ADR 0004). One adapter for every backend that speaks the
// OpenAI /chat/completions format — Gemini (via its OpenAI-compatibility endpoint), Groq,
// OpenRouter, Together, DeepSeek, or a local server. Selected by env (see createReasoner); the
// defaults target Google Gemini. This is how a run proceeds without Anthropic credits.
//
// It returns the SAME `ReasoningProvider` interface as createAnthropic — askText / askJSON /
// askWithTools — so the pipeline (`deps.ask`) is unchanged. The agentic gather loop is translated
// into OpenAI tool-calling, so the backend/model MUST support function calling.

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
const DEFAULT_MODEL = "gemini-2.5-flash";

export function createOpenAICompatible(config: RunConfig): ReasoningProvider {
  const apiKey = process.env.OPENAI_COMPAT_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "No key set for the OpenAI-compatible LLM provider (set GEMINI_API_KEY or OPENAI_COMPAT_API_KEY)",
    );
  }
  const baseURL = process.env.OPENAI_COMPAT_BASE_URL || GEMINI_BASE_URL;
  const model = process.env.OPENAI_COMPAT_MODEL || DEFAULT_MODEL;
  const client = new OpenAI({ apiKey, baseURL });

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
      max_tokens: opts.maxTokens ?? 1024,
      temperature: config.temperature,
    });
    return resp.choices[0]?.message?.content ?? "";
  }

  async function askJSON<T>(prompt: string, opts: AskOpts = {}): Promise<T> {
    return parseJSON<T>(await askText(prompt, opts));
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
        max_tokens: opts.maxTokens ?? 1024,
        temperature: config.temperature,
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
