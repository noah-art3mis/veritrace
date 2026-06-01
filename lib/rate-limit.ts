// Per-IP rate limiting for the API routes. A token-bucket per client IP, kept in a module-level
// Map. Each request spends one token; an empty bucket → 429. The bucket refills continuously so a
// caller gets a steady allowance plus a small burst.
//
// SERVERLESS CAVEAT: this is in-memory and therefore PER-INSTANCE — on a multi-instance deploy
// (Vercel) each instance has its own buckets, so the effective limit is (instances × capacity).
// It blunts accidental hammering and single-client abuse, but the real spend ceiling is the
// provider's hard budget cap (set it in the Anthropic/OpenAI/Google billing console). A distributed
// limiter (Upstash / Vercel KV) is the upgrade if a hard global limit is ever required.

export interface RateLimitResult {
  ok: boolean;
  /** When blocked, roughly how long until one token is available (ms). */
  retryAfterMs?: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
}

export interface RateLimiterOptions {
  /** Max tokens (the burst size). */
  capacity: number;
  /** Tokens refilled per minute (the sustained rate). */
  refillPerMin: number;
  /** Clock injection point for tests; defaults to Date.now. */
  now?: () => number;
}

export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  const { capacity, refillPerMin } = opts;
  const now = opts.now ?? (() => Date.now());
  const ratePerMs = refillPerMin / 60_000;
  const buckets = new Map<string, { tokens: number; last: number }>();

  function check(key: string): RateLimitResult {
    const t = now();
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { tokens: capacity, last: t };
      buckets.set(key, bucket);
    }
    // Refill for the elapsed time, capped at capacity.
    bucket.tokens = Math.min(capacity, bucket.tokens + (t - bucket.last) * ratePerMs);
    bucket.last = t;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return { ok: true };
    }
    const deficit = 1 - bucket.tokens;
    return { ok: false, retryAfterMs: Math.ceil(deficit / ratePerMs) };
  }

  return { check };
}

/** Best-effort client IP from the proxy chain; `x-forwarded-for` is set by Vercel/most proxies. */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

// Shared singleton used by the API routes (one bucket per IP across /api/check + /api/summary,
// since both kick off provider calls). Tunable via env; defaults aim at "a human running checks",
// not a load generator. A check spawns a heavy fan-out, so the sustained rate is deliberately low.
const BURST = Number(process.env.RATE_LIMIT_BURST) || 5;
const PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN) || 10;
export const apiRateLimiter: RateLimiter = createRateLimiter({
  capacity: BURST,
  refillPerMin: PER_MIN,
});
