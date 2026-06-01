import {
  modelInfo,
  OPENAI_BASE_URL,
  GEMINI_BASE_URL,
  DEEPSEEK_BASE_URL,
  type RunConfig,
} from "./run-config";
import { createAnthropic, type ReasoningProvider } from "./anthropic";
import { createOpenAICompatible } from "./openai-compatible";
import { createSemaphore } from "./semaphore";
import { throttleProvider } from "./throttle";

// A single shared concurrency limiter for ALL reasoning calls on this instance. The pipeline fans
// out ~50–60 parallel LLM calls per run (stream.ts), which trips a provider's requests-per-minute
// cap (Gemini's free tier). Sharing one semaphore across requests bounds the instance's total
// simultaneous calls to the provider — the right scope, since the RPM limit is per account, not
// per run. Tune with LLM_MAX_CONCURRENCY (default 5).
const MAX_CONCURRENCY = Number(process.env.LLM_MAX_CONCURRENCY) || 5;
const llmLimiter = createSemaphore(MAX_CONCURRENCY);

// Pick the reasoning backend from the SELECTED MODEL (ADR 0004). The model registry carries each
// model's provider and base URL, so choosing a model in the dropdown chooses the backend — there
// is no separate provider switch. Keys come from env per backend; search and the rest of `deps`
// are unaffected. Throws a clear, surfaceable error when the chosen model's key is missing. The
// returned provider is wrapped so every call passes through the shared concurrency limiter.
export function createReasoner(config: RunConfig): ReasoningProvider {
  const info = modelInfo(config.model);
  const provider =
    info.provider === "anthropic"
      ? createAnthropic(config)
      : createOpenAICompatible(config, {
          baseURL: process.env.OPENAI_COMPAT_BASE_URL || info.baseUrl || GEMINI_BASE_URL,
          apiKey: openAICompatKey(info.baseUrl),
          model: config.model,
        });
  return throttleProvider(provider, llmLimiter);
}

// The env key for an OpenAI-compatible backend, chosen by its endpoint. Pure (takes the env in) so
// the routing is unit-testable without mutating process.env. OPENAI_COMPAT_API_KEY is a universal
// override for custom backends (Groq / OpenRouter / a local server). A new backend must add its
// branch here, or its base URL falls through to the Gemini branch and silently grabs the wrong key.
export function openAICompatKey(
  baseUrl: string | undefined,
  env: Record<string, string | undefined> = process.env,
): string {
  if (env.OPENAI_COMPAT_API_KEY) return env.OPENAI_COMPAT_API_KEY;
  const route =
    baseUrl === OPENAI_BASE_URL
      ? { envVar: "OPENAI_API_KEY", name: "OpenAI" }
      : baseUrl === DEEPSEEK_BASE_URL
        ? { envVar: "DEEPSEEK_API_KEY", name: "DeepSeek" }
        : { envVar: "GEMINI_API_KEY", name: "Gemini" };
  const key = env[route.envVar];
  if (!key)
    throw new Error(`${route.envVar} is not set (required for the selected ${route.name} model).`);
  return key;
}
