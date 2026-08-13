import { describe, it, expect, vi } from "vitest";
import { throttleProvider } from "./throttle";
import { createSemaphore } from "./semaphore";
import type { ReasoningProvider } from "./reasoner-types";

function deferred() {
  let resolve!: (v: string) => void;
  const promise = new Promise<string>((r) => (resolve = r));
  return { promise, resolve };
}

describe("throttleProvider", () => {
  it("routes every method through the semaphore so calls serialize at the cap", async () => {
    const g1 = deferred();
    const g2 = deferred();
    const calls: string[] = [];
    const base: ReasoningProvider = {
      askText: vi.fn(async () => {
        calls.push("text-start");
        return g1.promise;
      }),
      askJSON: vi.fn(async () => {
        calls.push("json-start");
        return g2.promise as unknown as Promise<never>;
      }),
      askWithTools: vi.fn(),
    };

    const throttled = throttleProvider(base, createSemaphore(1));
    const p1 = throttled.askText("a");
    const p2 = throttled.askJSON("b");

    // Cap 1: only the first call has entered; the second waits for a slot.
    await Promise.resolve();
    expect(calls).toEqual(["text-start"]);

    g1.resolve("first");
    await p1;
    await Promise.resolve();
    expect(calls).toEqual(["text-start", "json-start"]);
    g2.resolve("second");
    await p2;
  });

  it("passes return values straight through", async () => {
    const base: ReasoningProvider = {
      askText: async () => "hello",
      askJSON: async () => ({ ok: true }) as never,
      askWithTools: async () => ({ text: "t", toolCalls: [], steps: 1 }),
    };
    const throttled = throttleProvider(base, createSemaphore(2));
    await expect(throttled.askText("x")).resolves.toBe("hello");
    await expect(throttled.askJSON("x")).resolves.toEqual({ ok: true });
    await expect(
      throttled.askWithTools("x", { tools: [], onTool: async () => null, maxSteps: 1 }),
    ).resolves.toMatchObject({ text: "t" });
  });
});
