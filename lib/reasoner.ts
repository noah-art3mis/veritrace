import type { RunConfig } from "./run-config";
import type { ReasoningProvider } from "./reasoner-types";
import { createGateway } from "./gateway";
import { createSemaphore } from "./semaphore";
import { throttleProvider } from "./throttle";

// A single shared concurrency limiter for ALL reasoning calls on this instance. The pipeline fans
// out ~50–60 parallel LLM calls per run (stream.ts), which can trip the gateway's requests-per-
// minute cap. Sharing one semaphore across requests bounds the instance's total simultaneous
// calls — the right scope, since the RPM limit is per account, not per run. Tune with
// LLM_MAX_CONCURRENCY (default 5).
const MAX_CONCURRENCY = Number(process.env.LLM_MAX_CONCURRENCY) || 5;
const llmLimiter = createSemaphore(MAX_CONCURRENCY);

// Every model runs through ONE OpenAI-compatible gateway (ADR 0012): OpenRouter by default,
// swappable to any other OpenAI-compatible gateway (Vercel AI Gateway, a self-hosted LiteLLM)
// via OPENROUTER_BASE_URL — the gateway, not this codebase, normalizes each provider's
// reasoning dialect. The returned provider is wrapped so every call passes through the shared
// concurrency limiter.
const DEFAULT_GATEWAY_BASE_URL = "https://openrouter.ai/api/v1";

export function createReasoner(config: RunConfig): ReasoningProvider {
  const provider = createGateway(config, {
    baseURL: process.env.OPENROUTER_BASE_URL || DEFAULT_GATEWAY_BASE_URL,
    apiKey: resolveGatewayKey(config),
    model: config.model,
  });
  return throttleProvider(provider, llmLimiter);
}

// The gateway key. Pure (takes config + env in) so the precedence is unit-testable without
// mutating process.env: the caller's key from the settings panel wins (BYO-key runs), then the
// server's env key. Throws a clear, surfaceable error instead of letting a missing key turn
// into an opaque 401 from the gateway.
export function resolveGatewayKey(
  config: Pick<RunConfig, "gatewayKey">,
  env: Record<string, string | undefined> = process.env,
): string {
  const key = config.gatewayKey || env.OPENROUTER_API_KEY;
  if (!key) {
    throw new Error("OPENROUTER_API_KEY is not set (and no gateway key was provided).");
  }
  return key;
}
