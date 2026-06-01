import { describe, it, expect } from "vitest";
import { createSemaphore } from "./semaphore";

// A deferred promise we can resolve from the test to control when a "task" finishes.
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe("createSemaphore", () => {
  it("never runs more than `max` tasks concurrently", async () => {
    const sem = createSemaphore(2);
    let active = 0;
    let peak = 0;
    const gates = Array.from({ length: 5 }, () => deferred());

    const runs = gates.map((g, i) =>
      sem.run(async () => {
        active++;
        peak = Math.max(peak, active);
        await g.promise;
        active--;
        return i;
      }),
    );

    // With cap 2, only the first two tasks should have started.
    await Promise.resolve();
    expect(active).toBe(2);

    // Release them one at a time; the queue should drain without ever exceeding the cap.
    for (const g of gates) {
      g.resolve();
      await Promise.resolve();
    }
    const results = await Promise.all(runs);
    expect(results).toEqual([0, 1, 2, 3, 4]);
    expect(peak).toBe(2);
  });

  it("releases a slot even when the task throws", async () => {
    const sem = createSemaphore(1);
    await expect(sem.run(async () => Promise.reject(new Error("boom")))).rejects.toThrow("boom");
    // If the slot leaked, this second task would hang forever.
    await expect(sem.run(async () => "ok")).resolves.toBe("ok");
  });

  it("passes the task's resolved value through", async () => {
    const sem = createSemaphore(3);
    await expect(sem.run(async () => 42)).resolves.toBe(42);
  });
});
