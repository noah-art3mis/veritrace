// A counting semaphore: caps how many async tasks run at once. The pipeline fans out ~50–60
// LLM calls per run (stream.ts resolves every question in parallel), which trips a provider's
// requests-per-minute limit (Gemini's free tier caps RPM low). Routing every LLM call through
// one shared semaphore bounds the simultaneous in-flight calls to the provider (ADR 0004 seam).

export interface Semaphore {
  /** Acquire a slot, run `fn`, and release the slot when it settles (resolve OR reject). */
  run<T>(fn: () => Promise<T>): Promise<T>;
}

export function createSemaphore(max: number): Semaphore {
  const cap = Math.max(1, Math.floor(max));
  let active = 0;
  const waiters: Array<() => void> = [];

  function acquire(): Promise<void> {
    if (active < cap) {
      active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => waiters.push(resolve));
  }

  function release(): void {
    const next = waiters.shift();
    if (next) {
      // Hand the slot straight to the next waiter — `active` stays at the cap.
      next();
    } else {
      active--;
    }
  }

  async function run<T>(fn: () => Promise<T>): Promise<T> {
    await acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  return { run };
}
