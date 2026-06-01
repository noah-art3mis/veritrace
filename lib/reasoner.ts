import type { RunConfig } from "./run-config";
import { createAnthropic, type ReasoningProvider } from "./anthropic";
import { createOpenAICompatible } from "./openai-compatible";

// Pick the reasoning backend for a run (ADR 0004). This is a SERVER-side env decision, never
// client-driven: `LLM_PROVIDER=openai-compatible` (aliases: "gemini", "openai") routes every
// reasoning call through the OpenAI-compatible adapter (Gemini by default); anything else keeps
// the Anthropic default. Running without Anthropic credits is just: set LLM_PROVIDER + the
// backend's key (e.g. GEMINI_API_KEY) in the environment. Search and the rest of `deps` are
// unaffected — only the reasoner swaps.
export function createReasoner(config: RunConfig): ReasoningProvider {
  const provider = (process.env.LLM_PROVIDER ?? "anthropic").toLowerCase();
  if (provider === "openai-compatible" || provider === "gemini" || provider === "openai") {
    return createOpenAICompatible(config);
  }
  return createAnthropic(config);
}
