import { describe, it, expect } from "vitest";
import { resolveGatewayKey } from "./reasoner";
import { DEFAULT_MODEL } from "./run-config";

// One gateway, one key (ADR 0012). The bug this guards: a run silently billing the wrong
// account, or a missing key surfacing as an opaque 401 instead of a clear config error.
describe("resolveGatewayKey", () => {
  it("uses the server env key when no user key is supplied", () => {
    expect(resolveGatewayKey({ model: DEFAULT_MODEL }, { OPENROUTER_API_KEY: "sk-or-env" })).toBe(
      "sk-or-env",
    );
  });

  it("prefers a user-supplied key over the server env (BYO-key runs)", () => {
    expect(
      resolveGatewayKey(
        { model: DEFAULT_MODEL, gatewayKey: "sk-or-user" },
        { OPENROUTER_API_KEY: "sk-or-env" },
      ),
    ).toBe("sk-or-user");
  });

  it("throws a key-named error when no key resolves", () => {
    expect(() => resolveGatewayKey({ model: DEFAULT_MODEL }, {})).toThrow(/OPENROUTER_API_KEY/);
  });
});

// The spend gate: the server's key pays only for CURATED models. parseConfig accepts any
// well-formed custom slug, so without this gate an anonymous request could point the server's
// account at the most expensive model in the gateway catalog.
describe("resolveGatewayKey spend gate for custom models", () => {
  it("refuses to bill a custom (uncurated) model to the server key", () => {
    expect(() =>
      resolveGatewayKey({ model: "openai/gpt-5.5-pro" }, { OPENROUTER_API_KEY: "sk-or-env" }),
    ).toThrow(/own .*key|key.*custom/i);
  });

  it("runs a custom model when the caller brings their own key", () => {
    expect(
      resolveGatewayKey(
        { model: "openai/gpt-5.5-pro", gatewayKey: "sk-or-user" },
        { OPENROUTER_API_KEY: "sk-or-env" },
      ),
    ).toBe("sk-or-user");
  });
});
