import { describe, it, expect } from "vitest";
import { parseJSON } from "./parse-json";

describe("parseJSON", () => {
  it("parses clean JSON", () => {
    expect(parseJSON('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips a ```json fence and surrounding prose", () => {
    const raw = 'Here you go:\n```json\n[{"x":1}]\n```\nHope that helps.';
    expect(parseJSON(raw)).toEqual([{ x: 1 }]);
  });

  // Gemini Flash emitted a triage array with a missing comma between objects, which the bounded
  // repair re-ask reproduced — crashing the whole run (issue #70). A tolerant final pass recovers
  // it locally instead of dying.
  it("recovers an array with a missing comma between elements", () => {
    const raw = '[{"text":"a","relevance":1.0}\n{"text":"b","relevance":0.0}]';
    expect(parseJSON(raw)).toEqual([
      { text: "a", relevance: 1.0 },
      { text: "b", relevance: 0.0 },
    ]);
  });

  it("recovers JSON truncated mid-array by closing the open structures", () => {
    // A model that runs out of tokens leaves an unterminated array/object; jsonrepair closes it.
    const raw = '[{"text":"a","relevance":1.0},{"text":"b"';
    const out = parseJSON<Array<{ text: string }>>(raw);
    expect(out[0]).toEqual({ text: "a", relevance: 1.0 });
    expect(out[1].text).toBe("b");
  });

  it("still throws when there is no JSON to recover", () => {
    expect(() => parseJSON("totally not json at all")).toThrow(/Could not parse JSON/);
  });
});
