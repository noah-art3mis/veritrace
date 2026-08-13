import type { JSONOpts } from "./ask-json";

// The reasoning seam (ADR 0004, ADR 0012): the whole pipeline (`deps.ask`) depends on this
// interface and nothing else, so the gateway adapter (lib/gateway.ts) — or a fake in tests —
// drops in behind it. Provider-neutral by construction: no SDK types leak through.

export interface AskOpts {
  system?: string;
  maxTokens?: number;
}

/** A tool the model may call during askWithTools (JSON-schema shape, provider-neutral). */
export interface ToolDef {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export interface ToolLoopOpts extends AskOpts {
  tools: ToolDef[];
  /** Execute one tool the model asked for; the return value becomes the tool result. */
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

export interface ReasoningProvider {
  /** Send a single prompt and return the concatenated text of the response. */
  askText(prompt: string, opts?: AskOpts): Promise<string>;
  /** Ask for JSON and parse it (tolerating fences / surrounding prose), with one repair re-ask. */
  askJSON<T>(prompt: string, opts?: JSONOpts): Promise<T>;
  /** Run a function-calling loop: the model searches via `tools` until it stops or maxSteps. */
  askWithTools(prompt: string, opts: ToolLoopOpts): Promise<ToolLoopResult>;
}
