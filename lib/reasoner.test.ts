import { describe, it, expect } from "vitest";
import { openAICompatKey } from "./reasoner";
import { OPENAI_BASE_URL, GEMINI_BASE_URL, DEEPSEEK_BASE_URL } from "./run-config";

// openAICompatKey picks the right env key from the selected model's endpoint (ADR 0004). The bug
// this guards: a new backend whose base URL falls through to the Gemini branch would silently use
// GEMINI_API_KEY. Each endpoint must resolve to its own key.
describe("openAICompatKey routing", () => {
  it("routes the DeepSeek endpoint to DEEPSEEK_API_KEY", () => {
    expect(openAICompatKey(DEEPSEEK_BASE_URL, { DEEPSEEK_API_KEY: "ds-1" })).toBe("ds-1");
  });

  it("routes the OpenAI endpoint to OPENAI_API_KEY", () => {
    expect(openAICompatKey(OPENAI_BASE_URL, { OPENAI_API_KEY: "oa-1" })).toBe("oa-1");
  });

  it("routes the Gemini endpoint (and unknown endpoints) to GEMINI_API_KEY", () => {
    expect(openAICompatKey(GEMINI_BASE_URL, { GEMINI_API_KEY: "gm-1" })).toBe("gm-1");
  });

  it("does not use GEMINI_API_KEY for a DeepSeek model", () => {
    expect(() => openAICompatKey(DEEPSEEK_BASE_URL, { GEMINI_API_KEY: "gm-1" })).toThrow(
      /DEEPSEEK_API_KEY/,
    );
  });

  it("lets OPENAI_COMPAT_API_KEY override every endpoint", () => {
    const env = { OPENAI_COMPAT_API_KEY: "override", GEMINI_API_KEY: "gm-1" };
    expect(openAICompatKey(DEEPSEEK_BASE_URL, env)).toBe("override");
    expect(openAICompatKey(OPENAI_BASE_URL, env)).toBe("override");
  });

  it("throws a key-named error when the endpoint's key is missing", () => {
    expect(() => openAICompatKey(DEEPSEEK_BASE_URL, {})).toThrow(/DEEPSEEK_API_KEY/);
    expect(() => openAICompatKey(OPENAI_BASE_URL, {})).toThrow(/OPENAI_API_KEY/);
    expect(() => openAICompatKey(GEMINI_BASE_URL, {})).toThrow(/GEMINI_API_KEY/);
  });
});
