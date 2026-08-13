import type { ReasoningProvider, AskOpts, ToolLoopOpts } from "./reasoner-types";
import type { JSONOpts } from "./ask-json";
import type { Semaphore } from "./semaphore";

// Wrap a ReasoningProvider so every public call acquires a semaphore slot first. This is the
// chokepoint that bounds simultaneous LLM calls to a provider (the 429 fix — see lib/semaphore.ts).
// askWithTools holds ONE slot for its whole model↔tool loop, which is what we want: a gather loop
// occupies a single concurrency slot rather than starving others between its round-trips.
//
// Note: askJSON's internal repair re-ask is NOT double-counted — the underlying provider's askJSON
// calls its own (unwrapped) askText closure, so only the outer wrapped method takes a slot.
export function throttleProvider(provider: ReasoningProvider, sem: Semaphore): ReasoningProvider {
  return {
    askText: (prompt: string, opts?: AskOpts) => sem.run(() => provider.askText(prompt, opts)),
    askJSON: <T>(prompt: string, opts?: JSONOpts) =>
      sem.run(() => provider.askJSON<T>(prompt, opts)),
    askWithTools: (prompt: string, opts: ToolLoopOpts) =>
      sem.run(() => provider.askWithTools(prompt, opts)),
  };
}
