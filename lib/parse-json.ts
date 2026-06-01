// Parse JSON out of a model's text response, tolerating ```json fences and surrounding prose.
// Shared by every ReasoningProvider (Anthropic, OpenAI-compatible, …) so the JSON-mode quirks
// that vary by model are handled in exactly one place.
export function parseJSON<T>(raw: string): T {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Strip a ```json … ``` fence or surrounding prose, then grab the outermost
    // bracketed region.
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    const body = fenced ? fenced[1] : trimmed;
    const start = body.search(/[[{]/);
    const end = Math.max(body.lastIndexOf("]"), body.lastIndexOf("}"));
    if (start >= 0 && end > start) {
      return JSON.parse(body.slice(start, end + 1)) as T;
    }
    throw new Error(`Could not parse JSON from model output: ${raw.slice(0, 200)}`);
  }
}
