import { describe, it, expect } from "vitest";
import { resolveGatewayKey } from "./reasoner";

// One gateway, one key (ADR 0012). The bug this guards: a run silently billing the wrong
// account, or a missing key surfacing as an opaque 401 instead of a clear config error.
describe("resolveGatewayKey", () => {
  it("uses the server env key when no user key is supplied", () => {
    expect(resolveGatewayKey({}, { OPENROUTER_API_KEY: "sk-or-env" })).toBe("sk-or-env");
  });

  it("prefers a user-supplied key over the server env (BYO-key runs)", () => {
    expect(
      resolveGatewayKey({ gatewayKey: "sk-or-user" }, { OPENROUTER_API_KEY: "sk-or-env" }),
    ).toBe("sk-or-user");
  });

  it("throws a key-named error when no key resolves", () => {
    expect(() => resolveGatewayKey({}, {})).toThrow(/OPENROUTER_API_KEY/);
  });
});
