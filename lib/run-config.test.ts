import { describe, it, expect } from "vitest";
import {
  parseConfig,
  supportsTemperature,
  modelInfo,
  DEFAULT_CONFIG,
  DEFAULT_MODEL,
  DEFAULT_CHARS,
  MIN_CHARS,
  MAX_CHARS,
} from "./run-config";

describe("parseConfig defaults", () => {
  it("returns the default config when input is undefined", () => {
    expect(parseConfig(undefined)).toEqual(DEFAULT_CONFIG);
  });

  it("returns the default config when input is null", () => {
    expect(parseConfig(null)).toEqual(DEFAULT_CONFIG);
  });

  it("defaults temperature to 0 — the deterministic setting", () => {
    expect(parseConfig({ model: DEFAULT_MODEL }).temperature).toBe(0);
  });

  it("defaults thinking to false", () => {
    expect(parseConfig({}).thinking).toBe(false);
  });
});

describe("parseConfig validation", () => {
  it("accepts a curated model", () => {
    expect(parseConfig({ model: "anthropic/claude-opus-5" }).model).toBe("anthropic/claude-opus-5");
  });

  it("accepts an uncurated creator/model slug (custom gateway model)", () => {
    expect(parseConfig({ model: "mistralai/mistral-large-3" }).model).toBe(
      "mistralai/mistral-large-3",
    );
  });

  it("rejects a model id without a creator prefix", () => {
    expect(() => parseConfig({ model: "gpt-4" })).toThrow(/model/i);
  });

  it("rejects a model id with path traversal or spaces", () => {
    expect(() => parseConfig({ model: "../etc/passwd" })).toThrow(/model/i);
    expect(() => parseConfig({ model: "openai/gpt 5" })).toThrow(/model/i);
  });

  it("rejects an absurdly long model id", () => {
    expect(() => parseConfig({ model: `openai/${"x".repeat(100)}` })).toThrow(/model/i);
  });

  it("accepts a temperature within range", () => {
    expect(parseConfig({ temperature: 0.7 }).temperature).toBe(0.7);
  });

  it("rejects a temperature above 1", () => {
    expect(() => parseConfig({ temperature: 1.5 })).toThrow(/temperature/i);
  });

  it("rejects a temperature below 0", () => {
    expect(() => parseConfig({ temperature: -0.1 })).toThrow(/temperature/i);
  });

  it("rejects a non-numeric temperature", () => {
    expect(() => parseConfig({ temperature: "hot" })).toThrow(/temperature/i);
  });

  it("coerces thinking to a boolean", () => {
    expect(parseConfig({ thinking: true }).thinking).toBe(true);
  });
});

describe("parseConfig maxClaims", () => {
  it("defaults maxClaims to 5", () => {
    expect(parseConfig({}).maxClaims).toBe(5);
  });

  it("accepts an in-range integer maxClaims", () => {
    expect(parseConfig({ maxClaims: 8 }).maxClaims).toBe(8);
  });

  it("rejects maxClaims below the minimum", () => {
    expect(() => parseConfig({ maxClaims: 0 })).toThrow(/claim/i);
  });

  it("rejects maxClaims above the maximum", () => {
    expect(() => parseConfig({ maxClaims: 11 })).toThrow(/claim/i);
  });

  it("rejects a non-integer maxClaims", () => {
    expect(() => parseConfig({ maxClaims: 3.5 })).toThrow(/claim/i);
  });
});

describe("parseConfig maxQuestions", () => {
  it("defaults maxQuestions to 2", () => {
    expect(parseConfig({}).maxQuestions).toBe(2);
  });

  it("accepts an in-range integer maxQuestions", () => {
    expect(parseConfig({ maxQuestions: 1 }).maxQuestions).toBe(1);
  });

  it("rejects maxQuestions below the minimum", () => {
    expect(() => parseConfig({ maxQuestions: 0 })).toThrow(/question/i);
  });

  it("rejects maxQuestions above the maximum", () => {
    expect(() => parseConfig({ maxQuestions: 11 })).toThrow(/question/i);
  });

  it("rejects a non-integer maxQuestions", () => {
    expect(() => parseConfig({ maxQuestions: 1.5 })).toThrow(/question/i);
  });
});

describe("parseConfig maxSources", () => {
  it("defaults maxSources to 2", () => {
    expect(parseConfig({}).maxSources).toBe(2);
  });

  it("accepts an in-range integer maxSources", () => {
    expect(parseConfig({ maxSources: 4 }).maxSources).toBe(4);
  });

  it("rejects maxSources below the minimum", () => {
    expect(() => parseConfig({ maxSources: 0 })).toThrow(/source/i);
  });

  it("rejects maxSources above the maximum", () => {
    expect(() => parseConfig({ maxSources: 11 })).toThrow(/source/i);
  });

  it("rejects a non-integer maxSources", () => {
    expect(() => parseConfig({ maxSources: 2.5 })).toThrow(/source/i);
  });
});

describe("parseConfig maxChars", () => {
  it("defaults maxChars to the read-depth default", () => {
    expect(parseConfig({}).maxChars).toBe(DEFAULT_CHARS);
  });

  it("accepts an in-range integer maxChars", () => {
    expect(parseConfig({ maxChars: 4000 }).maxChars).toBe(4000);
  });

  it("rejects maxChars below the minimum", () => {
    expect(() => parseConfig({ maxChars: MIN_CHARS - 1 })).toThrow(/char/i);
  });

  it("rejects maxChars above the maximum", () => {
    expect(() => parseConfig({ maxChars: MAX_CHARS + 1 })).toThrow(/char/i);
  });

  it("rejects a non-integer maxChars", () => {
    expect(() => parseConfig({ maxChars: 2400.5 })).toThrow(/char/i);
  });
});

describe("parseConfig deepSearch", () => {
  it("defaults deepSearch to false", () => {
    expect(parseConfig({}).deepSearch).toBe(false);
  });

  it("coerces a truthy deepSearch to true", () => {
    expect(parseConfig({ deepSearch: true }).deepSearch).toBe(true);
  });
});

describe("parseConfig depthMode", () => {
  it("defaults depthMode to false (breadth gather)", () => {
    expect(parseConfig({}).depthMode).toBe(false);
  });

  it("coerces a truthy depthMode to true", () => {
    expect(parseConfig({ depthMode: true }).depthMode).toBe(true);
  });

  it("coerces a falsy depthMode to false", () => {
    expect(parseConfig({ depthMode: 0 }).depthMode).toBe(false);
  });
});

describe("parseConfig category", () => {
  it("defaults category to no restriction", () => {
    expect(parseConfig({}).category).toBe("");
  });

  it("accepts a known Exa category", () => {
    expect(parseConfig({ category: "news" }).category).toBe("news");
  });

  it("treats an empty string as no restriction", () => {
    expect(parseConfig({ category: "" }).category).toBe("");
  });

  it("rejects an unknown category", () => {
    expect(() => parseConfig({ category: "tweets" })).toThrow(/category/i);
  });
});

describe("parseConfig preferFresh", () => {
  it("defaults preferFresh to false", () => {
    expect(parseConfig({}).preferFresh).toBe(false);
  });

  it("coerces a truthy preferFresh to true", () => {
    expect(parseConfig({ preferFresh: 1 }).preferFresh).toBe(true);
  });
});

describe("supportsTemperature", () => {
  it("reports reasoning-only curated models as not supporting temperature", () => {
    expect(supportsTemperature("anthropic/claude-opus-5")).toBe(false);
    expect(supportsTemperature("openai/gpt-5.6-luna")).toBe(false);
  });

  it("reports temperature-capable curated models as supporting it", () => {
    expect(supportsTemperature("anthropic/claude-sonnet-5")).toBe(true);
    expect(supportsTemperature("anthropic/claude-haiku-4.5")).toBe(true);
  });

  it("omits temperature for uncurated custom models (capabilities unknown)", () => {
    expect(supportsTemperature("mistralai/mistral-large-3")).toBe(false);
  });
});

describe("modelInfo for custom models", () => {
  it("falls back to a label-only entry with unknown costs", () => {
    const info = modelInfo("somecreator/some-model");
    expect(info.label).toBe("somecreator/some-model");
    expect(info.inputCost).toBeUndefined();
    expect(info.outputCost).toBeUndefined();
  });
});

describe("parseConfig API keys", () => {
  it("passes through non-empty trimmed keys", () => {
    const cfg = parseConfig({ gatewayKey: "  sk-or-123  ", exaKey: "exa-456" });
    expect(cfg.gatewayKey).toBe("sk-or-123");
    expect(cfg.exaKey).toBe("exa-456");
  });

  it("passes through the rerank key", () => {
    expect(parseConfig({ cohereKey: "co-1" }).cohereKey).toBe("co-1");
  });

  it("treats blank/whitespace keys as absent (env fallback)", () => {
    const cfg = parseConfig({ gatewayKey: "   ", exaKey: "" });
    expect(cfg.gatewayKey).toBeUndefined();
    expect(cfg.exaKey).toBeUndefined();
  });

  it("ignores non-string keys", () => {
    const cfg = parseConfig({ gatewayKey: 42 });
    expect(cfg.gatewayKey).toBeUndefined();
  });
});
