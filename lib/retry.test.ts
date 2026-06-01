import { describe, it, expect, vi } from "vitest";
import { withRetry, isTransientNetworkError } from "./retry";

const noSleep = async () => {};

describe("withRetry", () => {
  it("returns the first result without retrying on success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(
      withRetry(fn, { attempts: 3, isRetryable: () => true, sleep: noSleep }),
    ).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a retryable failure then succeeds", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("ETIMEDOUT")).mockResolvedValue("ok");
    await expect(
      withRetry(fn, { attempts: 3, isRetryable: () => true, sleep: noSleep }),
    ).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-retryable error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("400 bad request"));
    await expect(
      withRetry(fn, { attempts: 3, isRetryable: () => false, sleep: noSleep }),
    ).rejects.toThrow("400 bad request");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting attempts and throws the last error", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("ETIMEDOUT"));
    await expect(
      withRetry(fn, { attempts: 3, isRetryable: () => true, sleep: noSleep }),
    ).rejects.toThrow("ETIMEDOUT");
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("isTransientNetworkError", () => {
  it("flags connection-level errors by code", () => {
    expect(isTransientNetworkError(Object.assign(new Error("x"), { code: "ETIMEDOUT" }))).toBe(
      true,
    );
    expect(isTransientNetworkError(Object.assign(new Error("x"), { code: "ECONNRESET" }))).toBe(
      true,
    );
  });

  it("flags an AggregateError carrying a transient code", () => {
    const agg = Object.assign(new Error("agg"), { code: "ETIMEDOUT" });
    expect(isTransientNetworkError(agg)).toBe(true);
  });

  it("flags 5xx and 429 statuses as transient", () => {
    expect(isTransientNetworkError({ status: 503 })).toBe(true);
    expect(isTransientNetworkError({ status: 429 })).toBe(true);
  });

  it("does not flag a 400 or a plain error as transient", () => {
    expect(isTransientNetworkError({ status: 400 })).toBe(false);
    expect(isTransientNetworkError(new Error("nope"))).toBe(false);
  });
});
