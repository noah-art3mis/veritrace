// MODEL SMOKE TEST. Exercises every model in the registry against the three operations the
// pipeline actually uses — askText, askJSON (with shape validation), and askWithTools (the
// gather loop) — with minimal inputs, timing each call and capturing any error. This isolates
// per-model failures (auth, malformed JSON, no tool-calling support, latency) from the full
// Exa-backed pipeline, so a broken model surfaces in seconds and cents, not a 30s/gold run.
//
//   ! set -a; . ./.env.local; set +a; npx vitest run evals/model-smoke.eval.test.ts
//
// SMOKE_MODELS=gemini-2.5-flash,deepseek-v4-flash limits to a subset (default: all).

import { describe, it } from "vitest";
import { MODELS, DEFAULT_CONFIG, type ModelId } from "@/lib/run-config";
import { createReasoner } from "@/lib/reasoner";
import type { ToolDef } from "@/lib/anthropic";

const ALL_MODELS = Object.keys(MODELS) as ModelId[];
const subset = process.env.SMOKE_MODELS
  ? (process.env.SMOKE_MODELS.split(",").map((s) => s.trim()) as ModelId[])
  : ALL_MODELS;

// A single dummy tool so askWithTools has something to offer; the prompt nudges one call.
const ECHO_TOOL: ToolDef = {
  name: "echo",
  description: "Echo back a short note.",
  input_schema: {
    type: "object",
    properties: { note: { type: "string" } },
    required: ["note"],
  },
};

interface OpResult {
  ok: boolean;
  ms: number;
  detail: string;
}

async function timed(fn: () => Promise<string>): Promise<OpResult> {
  const start = Date.now();
  try {
    const detail = await fn();
    return { ok: true, ms: Date.now() - start, detail };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return { ok: false, ms: Date.now() - start, detail };
  }
}

describe("model smoke (live)", () => {
  for (const model of subset) {
    it(
      `smokes ${model}`,
      async () => {
        const reasoner = createReasoner({ ...DEFAULT_CONFIG, model });

        const text = await timed(async () => {
          const out = await reasoner.askText("Reply with exactly the word: pong", {
            maxTokens: 16,
          });
          return JSON.stringify(out.trim().slice(0, 40));
        });

        const json = await timed(async () => {
          const out = await reasoner.askJSON<{ answer: number }>(
            'Return ONLY this JSON, no prose: {"answer": 42}',
            {
              maxTokens: 64,
              validate: (v) => {
                if (typeof (v as { answer?: unknown })?.answer !== "number") {
                  throw new Error("missing numeric `answer`");
                }
              },
            },
          );
          return `answer=${out.answer}`;
        });

        const tools = await timed(async () => {
          const out = await reasoner.askWithTools(
            'Call the echo tool once with note "hi", then reply done.',
            { tools: [ECHO_TOOL], onTool: async () => ({ ok: true }), maxSteps: 3, maxTokens: 64 },
          );
          return `steps=${out.steps} toolCalls=${out.toolCalls.length}`;
        });

        const line = (label: string, r: OpResult) =>
          `  ${r.ok ? "✓" : "✗"} ${label.padEnd(9)} ${String(r.ms).padStart(6)}ms  ${r.detail.replace(/\s+/g, " ").slice(0, 160)}`;

        console.log(
          [
            `\n● ${model}`,
            line("askText", text),
            line("askJSON", json),
            line("askTools", tools),
          ].join("\n"),
        );

        // Diagnostic, not a gate: we want every model attempted and reported even when some fail.
        // The console output above is the deliverable; no expectations so one bad model doesn't
        // abort the rest.
      },
      5 * 60_000,
    );
  }
});
