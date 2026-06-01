import Anthropic from "@anthropic-ai/sdk";
import { THINKING_BUDGET, supportsTemperature, type RunConfig } from "./run-config";

// Per-request Anthropic access. createAnthropic binds the model, temperature, thinking
// setting, and API key from one RunConfig, so the whole pipeline can fan out many calls
// that all share the same run configuration without touching module globals.

export interface AskOpts {
  system?: string;
  maxTokens?: number;
}

/** A tool the model may call during askWithTools (Anthropic's JSON-schema tool shape). */
export type ToolDef = Anthropic.Tool;

export interface ToolLoopOpts extends AskOpts {
  tools: ToolDef[];
  /** Execute one tool the model asked for; the return value becomes the tool_result. */
  onTool: (name: string, input: unknown) => Promise<unknown>;
  /** Hard cap on model↔tool round-trips — the deterministic backstop on a model-driven loop. */
  maxSteps: number;
}

export interface ToolLoopResult {
  /** The final assistant text (empty if the loop hit maxSteps mid-tool-use). */
  text: string;
  /** Every tool call the model made, in order — for observability. */
  toolCalls: { name: string; input: unknown }[];
  /** How many model round-trips ran (≤ maxSteps). */
  steps: number;
}

export interface AnthropicCaller {
  /** Send a single prompt and return the concatenated text of the response. */
  askText(prompt: string, opts?: AskOpts): Promise<string>;
  /** Ask for JSON and parse it (tolerating fences / surrounding prose). */
  askJSON<T>(prompt: string, opts?: AskOpts): Promise<T>;
  /** Run a Claude function-calling loop: the model searches via `tools` until it stops or maxSteps. */
  askWithTools(prompt: string, opts: ToolLoopOpts): Promise<ToolLoopResult>;
}

export function createAnthropic(config: RunConfig): AnthropicCaller {
  const apiKey = config.anthropicKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set (and no key was provided)");
  }
  const client = new Anthropic({ apiKey });

  // Build the request body for one model turn. Two reasons temperature may be omitted:
  // (1) extended thinking requires it unset (the API forces temperature 1), and max_tokens
  // must exceed the thinking budget, so we add the budget on top of the per-call cap;
  // (2) newer models deprecated temperature outright and reject any request carrying it.
  // `extra` carries per-call additions like `tools`.
  function buildParams(
    messages: Anthropic.MessageParam[],
    opts: AskOpts,
    extra: Partial<Anthropic.MessageCreateParamsNonStreaming> = {},
  ): Anthropic.MessageCreateParamsNonStreaming {
    const maxTokens = opts.maxTokens ?? 1024;
    if (config.thinking) {
      return {
        model: config.model,
        max_tokens: THINKING_BUDGET + maxTokens,
        thinking: { type: "enabled", budget_tokens: THINKING_BUDGET },
        system: opts.system,
        messages,
        ...extra,
      };
    }
    const base: Anthropic.MessageCreateParamsNonStreaming = {
      model: config.model,
      max_tokens: maxTokens,
      system: opts.system,
      messages,
    };
    if (supportsTemperature(config.model)) {
      base.temperature = config.temperature;
    }
    return { ...base, ...extra };
  }

  function concatText(content: Anthropic.ContentBlock[]): string {
    return content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
  }

  async function askText(prompt: string, opts: AskOpts = {}): Promise<string> {
    const msg = await client.messages.create(
      buildParams([{ role: "user", content: prompt }], opts),
    );
    return concatText(msg.content);
  }

  async function askJSON<T>(prompt: string, opts: AskOpts = {}): Promise<T> {
    return parseJSON<T>(await askText(prompt, opts));
  }

  async function askWithTools(prompt: string, opts: ToolLoopOpts): Promise<ToolLoopResult> {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: prompt }];
    const toolCalls: { name: string; input: unknown }[] = [];
    let last: Anthropic.Message | undefined;
    let steps = 0;

    while (steps < opts.maxSteps) {
      steps++;
      const msg = await client.messages.create(buildParams(messages, opts, { tools: opts.tools }));
      last = msg;
      // Push the assistant turn verbatim — preserves thinking + tool_use blocks, which the
      // API requires echoed back on the next turn when thinking is enabled.
      messages.push({ role: "assistant", content: msg.content });
      if (msg.stop_reason !== "tool_use") break;

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of msg.content) {
        if (block.type !== "tool_use") continue;
        toolCalls.push({ name: block.name, input: block.input });
        const out = await opts.onTool(block.name, block.input);
        results.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(out),
        });
      }
      messages.push({ role: "user", content: results });
    }

    return { text: last ? concatText(last.content) : "", toolCalls, steps };
  }

  return { askText, askJSON, askWithTools };
}

function parseJSON<T>(raw: string): T {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Strip a ```json … ``` fence or surrounding prose, then grab the outermost
    // bracketed region.
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    const body = fenced ? fenced[1] : trimmed;
    const start = body.search(/[[{]/);
    const end = Math.max(body.lastIndexOf("]"), body.lastIndexOf("}"));
    if (start >= 0 && end > start) {
      return JSON.parse(body.slice(start, end + 1)) as T;
    }
    throw new Error(`Could not parse JSON from model output: ${raw.slice(0, 200)}`);
  }
}
