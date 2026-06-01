"use client";

import {
  MODELS,
  DEFAULT_MODEL,
  DEFAULT_CLAIMS,
  MIN_CLAIMS,
  MAX_CLAIMS,
  DEFAULT_QUESTIONS,
  MIN_QUESTIONS,
  MAX_QUESTIONS,
  DEFAULT_SOURCES,
  MIN_SOURCES,
  MAX_SOURCES,
  DEFAULT_CHARS,
  MIN_CHARS,
  MAX_CHARS,
  EXA_CATEGORIES,
  supportsTemperature,
  type ModelId,
  type ExaCategory,
} from "@/lib/run-config";

// The user-facing run settings. Mirrors RunConfig but keeps the two API keys as plain
// strings (always-controlled inputs); the empty string means "use the server default".
export interface Settings {
  model: ModelId;
  temperature: number;
  thinking: boolean;
  maxClaims: number;
  maxQuestions: number;
  maxSources: number;
  /** Chars of each source's text read per evidence card (Exa contents.text.maxCharacters). */
  maxChars: number;
  /** Use Exa's agentic "deep" search — higher recall on hard claims, slower and pricier. */
  deepSearch: boolean;
  /** Restrict retrieval to an Exa content category for cleaner extraction; "" = no restriction. */
  category: ExaCategory | "";
  /** Prefer freshly-crawled content over Exa's cache — fresher for breaking news, but slower. */
  preferFresh: boolean;
  /** Opt-in: short-circuit a claim with an existing Google Fact Check verdict, skipping retrieval. */
  factCheckShortCircuit: boolean;
  anthropicKey: string;
  exaKey: string;
  /** User-supplied Google Fact Check API key; "" = use the server's GOOGLE_FACT_CHECK_API_KEY. */
  googleFactCheckKey: string;
  /** Display-only: reveal the pipeline's hidden retrieval internals in the graph. */
  showInternals: boolean;
  /**
   * Display-only: hide the machine's aggregate Verdict (Source card badge + support ratio,
   * Investigation brief verdict + narrative) so the Fact-checker reads the evidence and
   * reaches their own conclusion. Makes the advisory-only stance literal. Per-claim badges
   * and evidence stance colours stay — they're observations, not the verdict.
   */
  withholdVerdict: boolean;
  /** Display-only: show the graph's minimap (the navigator thumbnail). */
  showMinimap: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
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
  anthropicKey: "",
  exaKey: "",
  googleFactCheckKey: "",
  showInternals: false,
  withholdVerdict: false,
  showMinimap: true,
};

const labelCls = "font-mono text-[9.5px] uppercase tracking-[0.22em] text-[var(--ink-3)]";
const fieldCls =
  "w-full rounded-md border border-[var(--line-2)] bg-[var(--bg)] px-2.5 py-1.5 font-mono text-[11.5px] text-[var(--ink-1)] focus:border-[var(--accent)] focus:outline-none";

export function SettingsPanel({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
}) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...settings, [key]: value });

  // Temperature is inert when extended thinking is on (API forces 1) or the model
  // deprecated the parameter (API rejects it). modelDeprecatesTemp takes precedence in
  // the readout because it can't be toggled off the way thinking can.
  const modelDeprecatesTemp = !supportsTemperature(settings.model);
  const tempInert = settings.thinking || modelDeprecatesTemp;

  return (
    // Cap the panel height and let it scroll within itself. On mobile every control stacks
    // into one tall column that otherwise runs off the bottom of the screen with no way to
    // reach the lower toggles + API keys (#5). On desktop the 4-col grid is short, so the cap
    // never engages and no scrollbar appears.
    <div className="grid max-h-[70vh] gap-4 overflow-y-auto overscroll-contain rounded-lg border border-[var(--line-2)] bg-[var(--bg)]/60 p-4 sm:grid-cols-2 lg:grid-cols-4">
      {/* Model */}
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Model</label>
        <select
          value={settings.model}
          onChange={(e) => set("model", e.target.value as ModelId)}
          className={fieldCls}
        >
          {(Object.entries(MODELS) as [ModelId, string][]).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {/* Temperature */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label className={labelCls}>Temperature</label>
          <span className="font-mono text-[10.5px] text-[var(--ink-2)]">
            {modelDeprecatesTemp
              ? "n/a · model default"
              : settings.thinking
                ? "1.0 · thinking"
                : settings.temperature.toFixed(2)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={settings.temperature}
          disabled={tempInert}
          onChange={(e) => set("temperature", Number(e.target.value))}
          className="w-full accent-[var(--accent)] disabled:opacity-40"
        />
        <span className="font-mono text-[9px] text-[var(--ink-4)]">
          {modelDeprecatesTemp
            ? "this model samples at its default — temperature is not configurable"
            : settings.thinking
              ? "fixed at 1 while extended thinking is on"
              : "0 = deterministic · 1 = most varied"}
        </span>
      </div>

      {/* Claims to extract — the legibility cap the graph grows from */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label className={labelCls}>Claims to extract</label>
          <span className="font-mono text-[10.5px] text-[var(--ink-2)]">
            up to {settings.maxClaims}
          </span>
        </div>
        <input
          type="range"
          min={MIN_CLAIMS}
          max={MAX_CLAIMS}
          step={1}
          value={settings.maxClaims}
          onChange={(e) => set("maxClaims", Number(e.target.value))}
          className="w-full accent-[var(--accent)]"
        />
        <span className="font-mono text-[9px] text-[var(--ink-4)]">
          legibility cap · more claims = denser graph, slower run
        </span>
      </div>

      {/* Questions per claim — the second graph multiplier (claims × questions × sources) */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label className={labelCls}>Questions per claim</label>
          <span className="font-mono text-[10.5px] text-[var(--ink-2)]">
            up to {settings.maxQuestions}
          </span>
        </div>
        <input
          type="range"
          min={MIN_QUESTIONS}
          max={MAX_QUESTIONS}
          step={1}
          value={settings.maxQuestions}
          onChange={(e) => set("maxQuestions", Number(e.target.value))}
          className="w-full accent-[var(--accent)]"
        />
        <span className="font-mono text-[9px] text-[var(--ink-4)]">
          resolving questions each claim fans out into
        </span>
      </div>

      {/* Sources per search — the third graph multiplier (Exa numResults) */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label className={labelCls}>Sources per search</label>
          <span className="font-mono text-[10.5px] text-[var(--ink-2)]">
            up to {settings.maxSources}
          </span>
        </div>
        <input
          type="range"
          min={MIN_SOURCES}
          max={MAX_SOURCES}
          step={1}
          value={settings.maxSources}
          onChange={(e) => set("maxSources", Number(e.target.value))}
          className="w-full accent-[var(--accent)]"
        />
        <span className="font-mono text-[9px] text-[var(--ink-4)]">
          evidence cards retrieved per query · the populous rank
        </span>
      </div>

      {/* Read depth — how much of each source's text the classifier sees (Exa text chars) */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <label className={labelCls}>Read depth</label>
          <span className="font-mono text-[10.5px] text-[var(--ink-2)]">
            {settings.maxChars.toLocaleString()} chars
          </span>
        </div>
        <input
          type="range"
          min={MIN_CHARS}
          max={MAX_CHARS}
          step={200}
          value={settings.maxChars}
          onChange={(e) => set("maxChars", Number(e.target.value))}
          className="w-full accent-[var(--accent)]"
        />
        <span className="font-mono text-[9px] text-[var(--ink-4)]">
          chars of each source read · billed per page, so deeper is ~free
        </span>
      </div>

      {/* Deep search — Exa's agentic retrieval; opt-in for hard / low-coverage claims */}
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Deep search</label>
        <button
          type="button"
          role="switch"
          aria-checked={settings.deepSearch}
          onClick={() => set("deepSearch", !settings.deepSearch)}
          className="inline-flex w-fit items-center gap-2 rounded-md border border-[var(--line-2)] bg-[var(--panel)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--ink-2)] transition-colors hover:border-[var(--accent)]"
        >
          <span
            className="h-2.5 w-2.5 rounded-full transition-colors"
            style={{ background: settings.deepSearch ? "var(--accent)" : "var(--line-2)" }}
          />
          {settings.deepSearch ? "On" : "Off"}
        </button>
        <span className="font-mono text-[9px] text-[var(--ink-4)]">
          agentic multi-step retrieval · higher recall, slower, pricier
        </span>
      </div>

      {/* Source category — optional Exa content filter; cleaner extraction, narrower recall */}
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Source category</label>
        <select
          value={settings.category}
          onChange={(e) => set("category", e.target.value as ExaCategory | "")}
          className={fieldCls}
        >
          <option value="">Any source</option>
          {EXA_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c[0].toUpperCase() + c.slice(1)}
            </option>
          ))}
        </select>
        <span className="font-mono text-[9px] text-[var(--ink-4)]">
          restrict retrieval · cleaner extraction, but narrows recall
        </span>
      </div>

      {/* Content freshness — opt into live crawling instead of Exa's cache */}
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Prefer fresh content</label>
        <button
          type="button"
          role="switch"
          aria-checked={settings.preferFresh}
          onClick={() => set("preferFresh", !settings.preferFresh)}
          className="inline-flex w-fit items-center gap-2 rounded-md border border-[var(--line-2)] bg-[var(--panel)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--ink-2)] transition-colors hover:border-[var(--accent)]"
        >
          <span
            className="h-2.5 w-2.5 rounded-full transition-colors"
            style={{ background: settings.preferFresh ? "var(--accent)" : "var(--line-2)" }}
          />
          {settings.preferFresh ? "Live crawl" : "Cached"}
        </button>
        <span className="font-mono text-[9px] text-[var(--ink-4)]">
          live-crawl over cache · fresher for breaking news, but slower
        </span>
      </div>

      {/* Fact-check short-circuit — opt-in; skips retrieval when a published verdict already exists */}
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Fact-check short-circuit</label>
        <button
          type="button"
          role="switch"
          aria-checked={settings.factCheckShortCircuit}
          onClick={() => set("factCheckShortCircuit", !settings.factCheckShortCircuit)}
          className="inline-flex w-fit items-center gap-2 rounded-md border border-[var(--line-2)] bg-[var(--panel)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--ink-2)] transition-colors hover:border-[var(--accent)]"
        >
          <span
            className="h-2.5 w-2.5 rounded-full transition-colors"
            style={{
              background: settings.factCheckShortCircuit ? "var(--accent)" : "var(--line-2)",
            }}
          />
          {settings.factCheckShortCircuit ? "On" : "Off"}
        </button>
        <span className="font-mono text-[9px] text-[var(--ink-4)]">
          skip retrieval when Google Fact Check already has a verdict · off = full de-novo run
        </span>
      </div>

      {/* Extended thinking */}
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Extended thinking</label>
        <button
          type="button"
          role="switch"
          aria-checked={settings.thinking}
          onClick={() => set("thinking", !settings.thinking)}
          className="inline-flex w-fit items-center gap-2 rounded-md border border-[var(--line-2)] bg-[var(--panel)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--ink-2)] transition-colors hover:border-[var(--accent)]"
        >
          <span
            className="h-2.5 w-2.5 rounded-full transition-colors"
            style={{ background: settings.thinking ? "var(--accent)" : "var(--line-2)" }}
          />
          {settings.thinking ? "On" : "Off"}
        </button>
      </div>

      {/* Show pipeline internals — display-only; reveals hidden retrieval steps in the graph */}
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Show pipeline internals</label>
        <button
          type="button"
          role="switch"
          aria-checked={settings.showInternals}
          onClick={() => set("showInternals", !settings.showInternals)}
          className="inline-flex w-fit items-center gap-2 rounded-md border border-[var(--line-2)] bg-[var(--panel)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--ink-2)] transition-colors hover:border-[var(--accent)]"
        >
          <span
            className="h-2.5 w-2.5 rounded-full transition-colors"
            style={{ background: settings.showInternals ? "var(--accent)" : "var(--line-2)" }}
          />
          {settings.showInternals ? "On" : "Off"}
        </button>
        <span className="font-mono text-[9px] text-[var(--ink-4)]">
          HyDE seed, agent queries + summary, stance confidence, raw fragment.
        </span>
      </div>

      {/* Withhold verdict — display-only; hides the machine's aggregate verdict so the
          Fact-checker reaches their own conclusion (CONTEXT.md: the human makes the final verdict) */}
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Withhold verdict</label>
        <button
          type="button"
          role="switch"
          aria-checked={settings.withholdVerdict}
          onClick={() => set("withholdVerdict", !settings.withholdVerdict)}
          className="inline-flex w-fit items-center gap-2 rounded-md border border-[var(--line-2)] bg-[var(--panel)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--ink-2)] transition-colors hover:border-[var(--accent)]"
        >
          <span
            className="h-2.5 w-2.5 rounded-full transition-colors"
            style={{ background: settings.withholdVerdict ? "var(--accent)" : "var(--line-2)" }}
          />
          {settings.withholdVerdict ? "Withheld" : "Shown"}
        </button>
        <span className="font-mono text-[9px] text-[var(--ink-4)]">
          hide the machine&rsquo;s verdict · read the evidence and decide yourself
        </span>
      </div>

      {/* Minimap — display-only; the navigator thumbnail in the graph corner */}
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Minimap</label>
        <button
          type="button"
          role="switch"
          aria-checked={settings.showMinimap}
          onClick={() => set("showMinimap", !settings.showMinimap)}
          className="inline-flex w-fit items-center gap-2 rounded-md border border-[var(--line-2)] bg-[var(--panel)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--ink-2)] transition-colors hover:border-[var(--accent)]"
        >
          <span
            className="h-2.5 w-2.5 rounded-full transition-colors"
            style={{ background: settings.showMinimap ? "var(--accent)" : "var(--line-2)" }}
          />
          {settings.showMinimap ? "On" : "Off"}
        </button>
        <span className="font-mono text-[9px] text-[var(--ink-4)]">
          navigator thumbnail in the graph corner
        </span>
      </div>

      {/* API keys */}
      <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-4">
        <label className={labelCls}>Your API keys · optional, stored in this browser</label>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={settings.anthropicKey}
            onChange={(e) => set("anthropicKey", e.target.value)}
            placeholder="ANTHROPIC_API_KEY · blank uses server default"
            className={fieldCls}
          />
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={settings.exaKey}
            onChange={(e) => set("exaKey", e.target.value)}
            placeholder="EXA_API_KEY · blank uses server default"
            className={fieldCls}
          />
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={settings.googleFactCheckKey}
            onChange={(e) => set("googleFactCheckKey", e.target.value)}
            placeholder="GOOGLE_FACT_CHECK_API_KEY · only used when short-circuit is on"
            className={`${fieldCls} sm:col-span-2`}
          />
        </div>
        <span className="font-mono text-[9px] text-[var(--ink-4)]">
          Sent only with your check requests and used in-memory; never stored on the server.
        </span>
      </div>
    </div>
  );
}
