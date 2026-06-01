import { modelInfo, OPENAI_BASE_URL, GEMINI_BASE_URL, type RunConfig } from "./run-config";
import { createAnthropic, type ReasoningProvider } from "./anthropic";
import { createOpenAICompatible } from "./openai-compatible";

// Pick the reasoning backend from the SELECTED MODEL (ADR 0004). The model registry carries each
// model's provider and base URL, so choosing a model in the dropdown chooses the backend — there
// is no separate provider switch. Keys come from env per backend; search and the rest of `deps`
// are unaffected. Throws a clear, surfaceable error when the chosen model's key is missing.
export function createReasoner(config: RunConfig): ReasoningProvider {
  const info = modelInfo(config.model);
  if (info.provider === "anthropic") return createAnthropic(config);

  const baseURL = process.env.OPENAI_COMPAT_BASE_URL || info.baseUrl || GEMINI_BASE_URL;
  return createOpenAICompatible(config, {
    baseURL,
    apiKey: resolveKey(info.baseUrl),
    model: config.model,
  });
}

// The env key for an OpenAI-compatible backend, chosen by its endpoint. OPENAI_COMPAT_API_KEY is
// a universal override for custom backends (Groq / OpenRouter / a local server).
function resolveKey(baseUrl?: string): string {
  const override = process.env.OPENAI_COMPAT_API_KEY;
  if (override) return override;
  if (baseUrl === OPENAI_BASE_URL) {
    const key = process.env.OPENAI_API_KEY;
    if (!key)
      throw new Error("OPENAI_API_KEY is not set (required for the selected OpenAI model).");
    return key;
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set (required for the selected Gemini model).");
  return key;
}
