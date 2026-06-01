import { describe, it, expect } from "vitest";
import { createRateLimiter, clientIp } from "./rate-limit";

describe("createRateLimiter (token bucket)", () => {
  it("allows a burst up to capacity, then blocks", () => {
    const rl = createRateLimiter({ capacity: 3, refillPerMin: 60, now: () => 0 });
    expect(rl.check("ip").ok).toBe(true);
    expect(rl.check("ip").ok).toBe(true);
    expect(rl.check("ip").ok).toBe(true);
    const blocked = rl.check("ip");
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("tracks buckets per key independently", () => {
    const rl = createRateLimiter({ capacity: 1, refillPerMin: 60, now: () => 0 });
    expect(rl.check("a").ok).toBe(true);
    expect(rl.check("a").ok).toBe(false);
    // A different key has its own full bucket.
    expect(rl.check("b").ok).toBe(true);
  });

  it("refills tokens over time", () => {
    let t = 0;
    const rl = createRateLimiter({ capacity: 1, refillPerMin: 60, now: () => t });
    expect(rl.check("ip").ok).toBe(true);
    expect(rl.check("ip").ok).toBe(false);
    // 60/min = 1 token/sec; advance 1s and the bucket has a token again.
    t = 1000;
    expect(rl.check("ip").ok).toBe(true);
  });

  it("never refills beyond capacity", () => {
    let t = 0;
    const rl = createRateLimiter({ capacity: 2, refillPerMin: 60, now: () => t });
    // Idle for an hour, then the burst is still capped at `capacity`.
    t = 3_600_000;
    expect(rl.check("ip").ok).toBe(true);
    expect(rl.check("ip").ok).toBe(true);
    expect(rl.check("ip").ok).toBe(false);
  });
});

describe("clientIp", () => {
  it("reads the first IP from x-forwarded-for", () => {
    const req = new Request("http://localhost/", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    });
    expect(clientIp(req)).toBe("203.0.113.7");
  });

  it("falls back to a sentinel when the header is absent", () => {
    expect(clientIp(new Request("http://localhost/"))).toBe("unknown");
  });
});
