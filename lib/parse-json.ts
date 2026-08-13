import { jsonrepair } from "jsonrepair";

// Parse JSON out of a model's text response, tolerating ```json fences and surrounding prose.
// Shared by every ReasoningProvider (the gateway adapter, test fakes, …) so the JSON-mode quirks
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
    if (start < 0 || end <= start) {
      throw new Error(`Could not parse JSON from model output: ${raw.slice(0, 200)}`);
    }
    try {
      return JSON.parse(body.slice(start, end + 1)) as T;
    } catch {
      // Weaker/cheaper models (Gemini Flash/Flash-Lite, OSS on Groq) emit subtly malformed JSON
      // — a missing comma between array elements, a trailing comma, output truncated mid-array.
      // jsonrepair fixes those structural slips deterministically, so a single flaky reply no
      // longer crashes the whole run (issue #70). It is the last resort, after the cheap parses.
      // Repair from the first bracket to the END (not the truncated region) so a structure cut
      // off mid-element — whose closing bracket never arrived — still gets closed.
      return JSON.parse(jsonrepair(body.slice(start))) as T;
    }
  }
}
