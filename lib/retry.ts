// Retry a flaky async operation a few times before giving up. The pipeline's web retrieval runs
// over consumer networks (the dev's WSL box, serverless cold starts), where a transient ETIMEDOUT
// or a provider 5xx is common and usually clears on a second try. Pure and injectable (sleep) so
// it stays deterministic in tests.

export interface RetryOptions {
  /** Total attempts INCLUDING the first (so `attempts: 3` = 1 try + 2 retries). */
  attempts: number;
  /** Whether a given error is worth retrying (transient) vs. a hard failure to surface now. */
  isRetryable: (err: unknown) => boolean;
  /** Base backoff between attempts; grows linearly. Default 250ms. */
  delayMs?: number;
  /** Injection point for tests; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const delayMs = opts.delayMs ?? 250;
  let lastErr: unknown;
  for (let attempt = 0; attempt < opts.attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === opts.attempts - 1 || !opts.isRetryable(err)) throw err;
      await sleep(delayMs * (attempt + 1));
    }
  }
  throw lastErr; // unreachable: the loop either returns or throws on the final attempt
}

// Connection-level Node errors that typically resolve on retry. fetch surfaces these as the
// error's `code` (sometimes wrapped in an AggregateError that still carries the code).
const TRANSIENT_CODES = new Set(["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "EPIPE"]);

/** True for transient network/server errors (connection codes, 5xx, 429) — safe to retry. */
export function isTransientNetworkError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string" && TRANSIENT_CODES.has(code)) return true;
  const status = (err as { status?: unknown }).status;
  if (typeof status === "number" && (status === 429 || status >= 500)) return true;
  return false;
}
