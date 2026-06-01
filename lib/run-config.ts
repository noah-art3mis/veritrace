// Per-run configuration for the VERITRACE pipeline. This is the single source of
// truth for which model runs, how deterministic it is (temperature), whether
// extended thinking is on, and which API keys to use. It is built once per request
// from the (untrusted) client body via parseConfig, then threaded down as `deps`.

// OpenAI-compatible API endpoints. The model registry below tags each non-Anthropic model with
// the endpoint it speaks to, so picking a model also picks the backend (ADR 0004) — there is no
// separate provider switch.
export const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";
export const OPENAI_BASE_URL = "https://api.openai.com/v1";

export type Provider = "anthropic" | "openai-compatible";

/** One selectable model: its label, which backend serves it, and (approximate) cost. */
export interface ModelInfo {
  label: string;
  provider: Provider;
  /** OpenAI-compatible endpoint (Gemini vs OpenAI vs …). Absent for the Anthropic provider. */
  baseUrl?: string;
  /** Approximate USD per 1M tokens — shown in the picker; verify against the provider's pricing. */
  inputCost: number;
  outputCost: number;
  /** Reasoning models reject a custom temperature; for these the UI control is inert. */
  noTemperature?: boolean;
}

// The models we expose in the UI dropdown. The entry's `provider` (+ `baseUrl`) decides which
// backend runs — selecting the model selects the backend. Keys come from env per backend
// (ANTHROPIC_API_KEY / GEMINI_API_KEY / OPENAI_API_KEY). Costs are approximate USD per 1M tokens.
export const MODELS = {
  "claude-opus-4-8": { label: "Opus 4.8", provider: "anthropic", inputCost: 15, outputCost: 75, noTemperature: true }, // prettier-ignore
  "claude-sonnet-4-6": { label: "Sonnet 4.6", provider: "anthropic", inputCost: 3, outputCost: 15 },
  "claude-haiku-4-5-20251001": { label: "Haiku 4.5", provider: "anthropic", inputCost: 1, outputCost: 5 }, // prettier-ignore
  "gpt-5.5": { label: "GPT-5.5", provider: "openai-compatible", baseUrl: OPENAI_BASE_URL, inputCost: 5, outputCost: 30, noTemperature: true }, // prettier-ignore
  "gpt-5.4-mini": { label: "GPT-5.4 mini", provider: "openai-compatible", baseUrl: OPENAI_BASE_URL, inputCost: 0.75, outputCost: 4.5, noTemperature: true }, // prettier-ignore
  "gpt-5.4-nano": { label: "GPT-5.4 nano", provider: "openai-compatible", baseUrl: OPENAI_BASE_URL, inputCost: 0.2, outputCost: 1.25, noTemperature: true }, // prettier-ignore
  "gemini-2.5-flash": { label: "Gemini 2.5 Flash", provider: "openai-compatible", baseUrl: GEMINI_BASE_URL, inputCost: 0.3, outputCost: 2.5 }, // prettier-ignore
  "gemini-2.5-flash-lite": { label: "Gemini 2.5 Flash-Lite", provider: "openai-compatible", baseUrl: GEMINI_BASE_URL, inputCost: 0.1, outputCost: 0.4 }, // prettier-ignore
} as const satisfies Record<string, ModelInfo>;

export type ModelId = keyof typeof MODELS;

// Default to the cheapest backend that has been running here — Gemini Flash-Lite — since the
// selected model now drives the provider and Anthropic credits may be exhausted. Change freely.
export const DEFAULT_MODEL: ModelId = "gemini-2.5-flash-lite";

/** A model's registry entry, typed as the uniform ModelInfo (not its narrow as-const literal). */
export function modelInfo(model: ModelId): ModelInfo {
  return MODELS[model];
}

/** Whether the API still accepts a `temperature` parameter for this model (reasoning models don't). */
export function supportsTemperature(model: ModelId): boolean {
  return !modelInfo(model).noTemperature;
}

// Extended-thinking budget. The API requires budget_tokens >= 1024 and
// max_tokens > budget_tokens; createAnthropic adds this on top of the per-call cap.
export const THINKING_BUDGET = 2048;

// How many atomic claims the extractor keeps. This is a legibility cap: the evidence
// graph grows as claims × questions × sources, so more claims means a denser, slower
// run. Surfaced and adjustable in the UI, but bounded server-side so a run stays
// readable and within the route's time budget.
export const MIN_CLAIMS = 1;
export const MAX_CLAIMS = 10;
export const DEFAULT_CLAIMS = 5;

// Resolving questions generated per checkable claim. Same legibility logic as claims —
// the graph is claims × questions × sources — so it is capped low and surfaced in the UI.
export const MIN_QUESTIONS = 1;
export const MAX_QUESTIONS = 10;
export const DEFAULT_QUESTIONS = 2;

// Sources retrieved per web search (Exa numResults). The third multiplier of the graph's
// size; the gather loop may issue several searches, so the evidence rank scales with this.
export const MIN_SOURCES = 1;
export const MAX_SOURCES = 10;
export const DEFAULT_SOURCES = 2;

// How much of each source's text we pull back (Exa contents.text.maxCharacters) and feed to
// the stance classifier. Exa bills content per page, not per character, so reading deeper is
// free on Exa's side — but it does grow the classify prompt (more Anthropic input tokens per
// run), so the ceiling is about classifier prompt size and latency, not Exa cost. Default is
// high on purpose: we'd rather the classifier read most of each document than a snippet.
export const MIN_CHARS = 200;
export const MAX_CHARS = 10000;
export const DEFAULT_CHARS = 6000;

// Exa content categories we expose as an optional retrieval filter ("" = no restriction).
// `news` yields cleaner extraction for most misinformation claims; the others are niche.
export const EXA_CATEGORIES = ["news", "research paper", "pdf"] as const;
export type ExaCategory = (typeof EXA_CATEGORIES)[number];

export interface RunConfig {
  model: ModelId;
  /** 0..1. Lower = more deterministic. Ignored (forced to 1) when thinking is on. */
  temperature: number;
  thinking: boolean;
  /** Atomic claims the extractor keeps (MIN_CLAIMS..MAX_CLAIMS) — a legibility cap. */
  maxClaims: number;
  /** Resolving questions per checkable claim (MIN_QUESTIONS..MAX_QUESTIONS) — a legibility cap. */
  maxQuestions: number;
  /** Sources retrieved per search (MIN_SOURCES..MAX_SOURCES) — Exa numResults, a legibility cap. */
  maxSources: number;
  /** Chars of each source's text pulled back (MIN_CHARS..MAX_CHARS) — Exa contents.text.maxCharacters. */
  maxChars: number;
  /** Use Exa's agentic "deep" search (higher recall, slower, pricier) instead of standard "auto". */
  deepSearch: boolean;
  /** Restrict retrieval to an Exa content category for cleaner extraction; "" = no restriction. */
  category: ExaCategory | "";
  /** Prefer freshly-crawled content over Exa's cache — fresher for breaking news, but slower. */
  preferFresh: boolean;
  /**
   * Opt-in short-circuit: before any question generation or web retrieval, ask the Google
   * Fact Check Tools API whether a known fact-checker already adjudicated each claim and, on
   * a confident hit, resolve it from that finding — skipping the expensive de-novo path.
   * Default FALSE: VERITRACE is de-novo by design (lib/exa.ts), and turning this off is how
   * you test the full pipeline without short-circuiting.
   */
  factCheckShortCircuit: boolean;
  /** User-supplied key; blank ⇒ the server falls back to its ANTHROPIC_API_KEY env. */
  anthropicKey?: string;
  /** User-supplied key; blank ⇒ the server falls back to its EXA_API_KEY env. */
  exaKey?: string;
  /** User-supplied key; blank ⇒ the server falls back to its GOOGLE_FACT_CHECK_API_KEY env. */
  googleFactCheckKey?: string;
}

// Default to temperature 0 — deterministic output is the whole point of a
// fact-checking pipeline, and the reason runs were varying before.
export const DEFAULT_CONFIG: RunConfig = {
  model: DEFAULT_MODEL,
  temperature: 0,
  thinking: false,
  maxClaims: DEFAULT_CLAIMS,
  maxQuestions: DEFAULT_QUESTIONS,
  maxSources: DEFAULT_SOURCES,
  maxChars: DEFAULT_CHARS,
  deepSearch: false,
  category: "",
  preferFresh: false,
  factCheckShortCircuit: false,
};

function isModelId(value: unknown): value is ModelId {
  return typeof value === "string" && value in MODELS;
}

/** Trim a key string; treat blank/whitespace or non-string as absent (env fallback). */
function cleanKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Validate and coerce an untrusted request body into a RunConfig. Missing fields fall
 * back to DEFAULT_CONFIG. Throws on a hard-invalid model or out-of-range temperature so
 * the API route can answer 400 rather than forwarding garbage to the model.
 */
export function parseConfig(input: unknown): RunConfig {
  if (input == null) return { ...DEFAULT_CONFIG };
  if (typeof input !== "object") {
    throw new Error("config must be an object");
  }
  const raw = input as Record<string, unknown>;

  let model: ModelId = DEFAULT_MODEL;
  if (raw.model !== undefined) {
    if (!isModelId(raw.model)) throw new Error(`Unknown model: ${String(raw.model)}`);
    model = raw.model;
  }

  let temperature = DEFAULT_CONFIG.temperature;
  if (raw.temperature !== undefined) {
    const t = raw.temperature;
    if (typeof t !== "number" || Number.isNaN(t) || t < 0 || t > 1) {
      throw new Error("temperature must be a number between 0 and 1");
    }
    temperature = t;
  }

  let maxClaims = DEFAULT_CONFIG.maxClaims;
  if (raw.maxClaims !== undefined) {
    const m = raw.maxClaims;
    if (typeof m !== "number" || !Number.isInteger(m) || m < MIN_CLAIMS || m > MAX_CLAIMS) {
      throw new Error(`maxClaims must be an integer between ${MIN_CLAIMS} and ${MAX_CLAIMS}`);
    }
    maxClaims = m;
  }

  let maxQuestions = DEFAULT_CONFIG.maxQuestions;
  if (raw.maxQuestions !== undefined) {
    const q = raw.maxQuestions;
    if (typeof q !== "number" || !Number.isInteger(q) || q < MIN_QUESTIONS || q > MAX_QUESTIONS) {
      throw new Error(
        `maxQuestions must be an integer between ${MIN_QUESTIONS} and ${MAX_QUESTIONS}`,
      );
    }
    maxQuestions = q;
  }

  let maxSources = DEFAULT_CONFIG.maxSources;
  if (raw.maxSources !== undefined) {
    const s = raw.maxSources;
    if (typeof s !== "number" || !Number.isInteger(s) || s < MIN_SOURCES || s > MAX_SOURCES) {
      throw new Error(`maxSources must be an integer between ${MIN_SOURCES} and ${MAX_SOURCES}`);
    }
    maxSources = s;
  }

  let maxChars = DEFAULT_CONFIG.maxChars;
  if (raw.maxChars !== undefined) {
    const c = raw.maxChars;
    if (typeof c !== "number" || !Number.isInteger(c) || c < MIN_CHARS || c > MAX_CHARS) {
      throw new Error(`maxChars must be an integer between ${MIN_CHARS} and ${MAX_CHARS}`);
    }
    maxChars = c;
  }

  let category: ExaCategory | "" = DEFAULT_CONFIG.category;
  if (raw.category !== undefined && raw.category !== "") {
    if (!EXA_CATEGORIES.includes(raw.category as ExaCategory)) {
      throw new Error(`category must be one of: ${EXA_CATEGORIES.join(", ")}`);
    }
    category = raw.category as ExaCategory;
  }

  return {
    model,
    temperature,
    thinking: Boolean(raw.thinking),
    maxClaims,
    maxQuestions,
    maxSources,
    maxChars,
    deepSearch: Boolean(raw.deepSearch),
    category,
    preferFresh: Boolean(raw.preferFresh),
    factCheckShortCircuit: Boolean(raw.factCheckShortCircuit),
    anthropicKey: cleanKey(raw.anthropicKey),
    exaKey: cleanKey(raw.exaKey),
    googleFactCheckKey: cleanKey(raw.googleFactCheckKey),
  };
}
