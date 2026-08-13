import type { AskOpts } from "./reasoner-types";
import { parseJSON } from "./parse-json";

// Options for a JSON ask: standard AskOpts plus an optional validator that THROWS on a
// structurally-invalid result (e.g. a Zod parse, or a hand-written shape check).
export interface JSONOpts extends AskOpts {
  /** Throw if the parsed value isn't the shape the caller needs; a throw triggers one repair re-ask. */
  validate?: (value: unknown) => void;
}

// Ask a ReasoningProvider for JSON with one bounded repair re-ask (ADR 0004). A weaker/cheaper
// model — a Gemini flash-lite, an OSS model on Groq — more often emits malformed JSON or the
// wrong shape; rather than crash the pipeline, we re-ask ONCE with the parse/validation error fed
// back, then give up. Deterministic: at most two model calls, never more. Providers wire their
// own `askText` in, so the repair behaviour is shared across every backend.
export async function askJSONWithRepair<T>(
  askText: (prompt: string, opts?: AskOpts) => Promise<string>,
  prompt: string,
  opts: JSONOpts = {},
): Promise<T> {
  const attempt = async (p: string): Promise<T> => {
    const parsed = parseJSON<T>(await askText(p, opts));
    opts.validate?.(parsed);
    return parsed;
  };
  try {
    return await attempt(prompt);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const repair = `${prompt}\n\nYour previous reply could not be used (${reason}). Respond with ONLY valid JSON in the exact shape requested — no prose, no code fences.`;
    return attempt(repair);
  }
}
