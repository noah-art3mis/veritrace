// Per-run configuration for the VERITRACE pipeline. This is the single source of
// truth for which model runs, how deterministic it is (temperature), whether
// extended thinking is on, and which API keys to use. It is built once per request
// from the (untrusted) client body via parseConfig, then threaded down as `deps`.

// Every model is served through ONE OpenAI-compatible gateway (ADR 0012) — OpenRouter by
// default, overridable via env (lib/reasoner.ts) — so a model id is a gateway slug
// ("creator/model") and there is no per-model backend or key routing. The gateway
// normalizes each provider's reasoning/thinking dialect behind the standard params.

/** One selectable model: its picker label and (approximate) cost. */
export interface ModelInfo {
  label: string;
  /** Approximate USD per 1M tokens — shown in the picker; absent (custom models) ⇒ unknown. */
  inputCost?: number;
  outputCost?: number;
  /** Reasoning models reject a custom temperature; for these the UI control is inert. */
  noTemperature?: boolean;
}

// The curated models in the UI dropdown, keyed by OpenRouter slug. Curation buys a human label,
// a cost estimate, and a verified temperature capability — any other gateway model still runs
// via the custom-model field (parseConfig accepts any well-formed "creator/model" slug).
// Costs are OpenRouter's USD per 1M tokens, checked 2026-08-12.
export const MODELS = {
  "anthropic/claude-haiku-4.5": { label: "Haiku 4.5", inputCost: 1, outputCost: 5 },
  "anthropic/claude-sonnet-5": { label: "Sonnet 5", inputCost: 2, outputCost: 10 },
  "anthropic/claude-opus-5": { label: "Opus 5", inputCost: 5, outputCost: 25, noTemperature: true }, // prettier-ignore
  "openai/gpt-5.5": { label: "GPT-5.5", inputCost: 5, outputCost: 30, noTemperature: true },
  "openai/gpt-5.6-luna": { label: "GPT-5.6 Luna", inputCost: 0.1, outputCost: 0.6, noTemperature: true }, // prettier-ignore
  "google/gemini-2.5-flash": { label: "Gemini 2.5 Flash", inputCost: 0.3, outputCost: 2.5 },
  "google/gemini-2.5-flash-lite": { label: "Gemini 2.5 Flash-Lite", inputCost: 0.1, outputCost: 0.4 }, // prettier-ignore
  "deepseek/deepseek-v4-flash": { label: "DeepSeek V4 Flash", inputCost: 0.14, outputCost: 0.28, noTemperature: true }, // prettier-ignore
  "deepseek/deepseek-v4-pro": { label: "DeepSeek V4 Pro", inputCost: 1.17, outputCost: 2.34, noTemperature: true }, // prettier-ignore
  "z-ai/glm-5.2": { label: "GLM 5.2", inputCost: 0.49, outputCost: 1.54 },
  "moonshotai/kimi-k3": { label: "Kimi K3", inputCost: 3, outputCost: 15 },
} as const satisfies Record<string, ModelInfo>;

export type ModelId = keyof typeof MODELS;

// The cheapest curated reasoning model — default runs must stay cheap since the server's
// gateway key pays for anonymous traffic.
export const DEFAULT_MODEL: ModelId = "openai/gpt-5.6-luna";

// A gateway model id: "creator/model", both segments from the character set the gateways
// actually use (letters, digits, dot, dash, underscore, and ":variant" suffixes). Bounded
// so an untrusted body can't smuggle arbitrary strings into the request path.
const MODEL_ID_RE = /^[a-z0-9][\w.-]{0,39}\/[\w.:-]{1,60}$/i;

/** Whether this string is a well-formed gateway model slug (curated or custom). */
export function isWellFormedModelId(value: unknown): value is string {
  return typeof value === "string" && MODEL_ID_RE.test(value);
}

/**
 * A model's registry entry. Uncurated (custom) models fall back to a label-only entry:
 * costs unknown, and temperature omitted since we can't know whether the model accepts it.
 */
export function modelInfo(model: string): ModelInfo {
  return (MODELS as Record<string, ModelInfo>)[model] ?? { label: model, noTemperature: true };
}

/** Whether the API still accepts a `temperature` parameter for this model (reasoning models don't). */
export function supportsTemperature(model: string): boolean {
  return !modelInfo(model).noTemperature;
}

// Reasoning headroom. Providers that reason before answering bill the reasoning tokens against
// max_tokens, so a tight answer budget gets entirely consumed by reasoning and the content comes
// back empty (finish_reason: "length", which crashes parseJSON). The gateway adapter adds this on
// top of every caller's answer budget — unconditionally, since through one gateway we can't know
// which models reason by default, and for non-reasoning models a higher cap costs nothing.
export const REASONING_TOKEN_RESERVE = 4096;

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

// Depth mode (the breadth↔depth alternative). Instead of fanning out parallel queries under a
// question, the gather agent walks ONE source toward its origin: it follows the most promising
// outbound link (after dedup), and when a page dead-ends it searches for the lead the article
// names (the originating outlet / agency). These bound that model-driven walk.
//
//   - MAX_DEPTH_HOPS: how many links the walk may follow before it stops and judges what it holds —
//     the depth analogue of the breadth gather's MIN_DECIDING bar (resolve.ts). The walk reaches at
//     most this far from the first source toward the origin.
//   - DEPTH_LINKS_PER_SOURCE: how many outbound links we pull off each visited page (Exa
//     extras.links). The agent picks the most origin-likely one from this frontier; the rest are
//     deduped away so the walk never loops back on a page it has already read.
export const MAX_DEPTH_HOPS = 6;
export const DEPTH_LINKS_PER_SOURCE = 12;

export interface RunConfig {
  /** A gateway model slug — a curated ModelId or any well-formed custom "creator/model". */
  model: string;
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
  /**
   * Depth mode (#depth): swap the breadth gather (fan out parallel queries) for a depth-first
   * walk that follows each source's outbound links toward the originating source, and searches
   * for the lead an article names when its links dead-end. Off ⇒ the default breadth gather.
   * The graph stays 4 layers either way — depth lives in the retrieval *process*, recorded as the
   * walk order on each evidence item — so this is a gather *strategy*, not a new graph rank.
   */
  depthMode: boolean;
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
  /**
   * Opt-in embedding re-rank of gathered candidates (#57, ADR 0010): when on AND a Cohere key
   * resolves, the gather stage embeds the candidates + the directional hypotheticals and keeps the
   * top-N by cosine before classify. Default FALSE — VERITRACE keeps no embeddings in the de-novo
   * path (ADR 0005); this is the heavier alternative to RRF (#56). Off / no key ⇒ no re-rank.
   */
  rerank: boolean;
  /** User-supplied gateway key; blank ⇒ the server's OPENROUTER_API_KEY env. */
  gatewayKey?: string;
  /** User-supplied key; blank ⇒ the server falls back to its EXA_API_KEY env. */
  exaKey?: string;
  /** User-supplied key; blank ⇒ the server falls back to its GOOGLE_FACT_CHECK_API_KEY env. */
  googleFactCheckKey?: string;
  /** User-supplied Cohere key for the opt-in re-rank; blank ⇒ the server's COHERE_API_KEY env. */
  cohereKey?: string;
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
  rerank: false,
  depthMode: false,
};

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

  let model: string = DEFAULT_MODEL;
  if (raw.model !== undefined) {
    if (!isWellFormedModelId(raw.model)) {
      throw new Error(
        `Invalid model id: ${String(raw.model)} — expected a gateway slug like "creator/model".`,
      );
    }
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
    rerank: Boolean(raw.rerank),
    depthMode: Boolean(raw.depthMode),
    gatewayKey: cleanKey(raw.gatewayKey),
    exaKey: cleanKey(raw.exaKey),
    googleFactCheckKey: cleanKey(raw.googleFactCheckKey),
    cohereKey: cleanKey(raw.cohereKey),
  };
}
