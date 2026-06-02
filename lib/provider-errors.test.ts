import { describe, it, expect } from "vitest";
import { friendlyProviderError } from "./provider-errors";

// Both the OpenAI and Anthropic SDKs throw error objects carrying a numeric `.status`. Gemini's
// free-tier rate limit surfaced as `429 status code (no body)` — opaque to the user. We map by
// status into actionable guidance before the error reaches the client.
describe("friendlyProviderError", () => {
  it("maps a 429 to readable rate-limit guidance", () => {
    const msg = friendlyProviderError({ status: 429, message: "429 status code (no body)" });
    expect(msg).toMatch(/rate-?limit/i);
    expect(msg).not.toMatch(/no body/i);
  });

  it("maps 401/403 to a key/credit message", () => {
    expect(friendlyProviderError({ status: 401, message: "x" })).toMatch(/key|credit|auth/i);
    expect(friendlyProviderError({ status: 403, message: "x" })).toMatch(/key|credit|auth/i);
  });

  it("maps an insufficient_quota code to a credit message", () => {
    const msg = friendlyProviderError({ status: 429, code: "insufficient_quota", message: "x" });
    expect(msg).toMatch(/credit|quota|billing/i);
  });

  it("maps Anthropic's credit-balance 400 to a credit message, not the raw body", () => {
    // Anthropic signals an exhausted balance as a 400 (no 429 / insufficient_quota code), so the
    // mapping has to recognise the wording or the user just sees a raw JSON blob.
    const raw =
      '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API."}}';
    const msg = friendlyProviderError({ status: 400, message: raw });
    expect(msg).toMatch(/credit|quota|billing/i);
    expect(msg).not.toMatch(/^400 \{/);
  });

  it("passes a plain Error message through as the fallback", () => {
    expect(friendlyProviderError(new Error("Exa exploded"))).toBe("Exa exploded");
  });

  it("returns a generic message for a non-error value", () => {
    expect(friendlyProviderError(undefined)).toMatch(/.+/);
  });
});
