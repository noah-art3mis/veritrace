// Map raw gateway SDK errors into a readable, actionable message before they reach the client.
// The OpenAI SDK (which the gateway adapter speaks through) throws error objects carrying a
// numeric `.status` (and often a `.code`); rate limits otherwise surface as the opaque
// `⚠ 429 status code (no body)`. This turns them into guidance the user can act on. Unknown
// errors fall back to their own message.

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
  // OpenRouter signals an out-of-credit account with 402 Payment Required.
  if (status === 402) return CREDIT_MESSAGE;

  if (status === 429) {
    return "Rate-limited by the gateway or the model provider behind it. Wait a moment and retry, lower the claims/questions caps to shrink the run, or use a key with more headroom.";
  }
  if (status === 401 || status === 403) {
    return "The gateway rejected the API key (unauthorized). Check that OPENROUTER_API_KEY (or your own key in Settings) is valid and has credit.";
  }

  if (err instanceof Error && err.message) return err.message;
  return "The request failed unexpectedly. Please try again.";
}
