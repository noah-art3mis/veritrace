// Map raw provider SDK errors into a readable, actionable message before they reach the client.
// Both the OpenAI and Anthropic SDKs throw error objects carrying a numeric `.status` (and often a
// `.code`). Gemini's free-tier rate limit surfaced as the opaque `⚠ 429 status code (no body)`;
// this turns that into guidance the user can act on. Unknown errors fall back to their own message.

function errorStatus(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "status" in err) {
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number") return status;
  }
  return undefined;
}

function errorCode(err: unknown): string | undefined {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

const CREDIT_MESSAGE =
  "The model provider rejected the request for credit/quota reasons. Add credit or check your API key's billing, or switch to a model whose key has quota.";

export function friendlyProviderError(err: unknown): string {
  const status = errorStatus(err);
  const code = errorCode(err);

  if (code === "insufficient_quota") return CREDIT_MESSAGE;

  if (status === 429) {
    return "Rate-limited by the model provider (a free tier such as Gemini's caps requests per minute). Wait a moment and retry, lower the claims/questions caps to shrink the run, or use a paid key.";
  }
  if (status === 401 || status === 403) {
    return "The model provider rejected the API key (unauthorized). Check that the right key is set for the selected model, and that it has credit.";
  }

  if (err instanceof Error && err.message) return err.message;
  return "The request failed unexpectedly. Please try again.";
}
