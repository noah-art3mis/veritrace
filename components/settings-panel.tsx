"use client";

import { useEffect } from "react";
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
  isWellFormedModelId,
  type ModelId,
  type ModelInfo,
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
  /**
   * Depth mode: trace each claim toward its origin by following sources' outbound links (and
   * chasing the lead an article names when links dead-end) instead of fanning out parallel
   * queries. Renders as the spiral view. Off ⇒ the default breadth gather.
   */
  depthMode: boolean;
  /** Restrict retrieval to an Exa content category for cleaner extraction; "" = no restriction. */
  category: ExaCategory | "";
  /** Prefer freshly-crawled content over Exa's cache — fresher for breaking news, but slower. */
  preferFresh: boolean;
  /** Opt-in: short-circuit a claim with an existing Google Fact Check verdict, skipping retrieval. */
  factCheckShortCircuit: boolean;
  /** Custom gateway model slug ("creator/model"); "" = use the dropdown's curated model. */
  customModel: string;
  /** Gateway (OpenRouter) key; "" = use the server's OPENROUTER_API_KEY env. */
  gatewayKey: string;
  exaKey: string;
  /** User-supplied Google Fact Check API key; "" = use the server's GOOGLE_FACT_CHECK_API_KEY. */
  googleFactCheckKey: string;
  /** User-supplied Cohere key for the opt-in embedding re-rank; "" = the server's COHERE_API_KEY. */
  cohereKey: string;
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

/**
 * The model a run will actually use: a filled custom slug overrides the dropdown; blank ⇒
 * the curated dropdown model. The ONLY place this rule lives — every consumer (run config,
 * labels, temperature logic) calls this instead of re-deriving, so the sites can't drift.
 */
export function effectiveModel(settings: Pick<Settings, "model" | "customModel">): string {
  return settings.customModel.trim() || settings.model;
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
  depthMode: false,
  category: "",
  preferFresh: false,
  factCheckShortCircuit: false,
  customModel: "",
  gatewayKey: "",
  exaKey: "",
  googleFactCheckKey: "",
  cohereKey: "",
  withholdVerdict: false,
  showMinimap: true,
};

const labelCls = "font-mono text-[9.5px] uppercase tracking-[0.22em] text-[var(--ink-3)]";
const fieldCls =
  "w-full rounded-md border border-[var(--line-2)] bg-[var(--bg)] px-2.5 py-1.5 font-mono text-[11.5px] text-[var(--ink-1)] focus:border-[var(--accent)] focus:outline-none";
const toggleCls =
  "inline-flex w-fit items-center gap-2 rounded-md border border-[var(--line-2)] bg-[var(--panel)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--ink-2)] transition-colors hover:border-[var(--accent)]";
const helpCls = "font-mono text-[9px] text-[var(--ink-4)]";

// A topical group within the sidebar — a titled, hairline-separated band of related
// controls. Streamlit-style: each section owns one concern (model, scope, retrieval…).
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h3 className="flex items-center gap-2 border-b border-[var(--line)] pb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ink-2)]">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
        {title}
      </h3>
      {children}
    </section>
  );
}

// A small on/off pill toggle. Used for the boolean settings throughout the sidebar.
function Toggle({
  checked,
  onClick,
  onLabel = "On",
  offLabel = "Off",
}: {
  checked: boolean;
  onClick: () => void;
  onLabel?: string;
  offLabel?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onClick}
      className={toggleCls}
    >
      <span
        className="h-2.5 w-2.5 rounded-full transition-colors"
        style={{ background: checked ? "var(--accent)" : "var(--line-2)" }}
      />
      {checked ? onLabel : offLabel}
    </button>
  );
}

export function SettingsPanel({
  settings,
  onChange,
  open,
  onClose,
}: {
  settings: Settings;
  onChange: (next: Settings) => void;
  open: boolean;
  onClose: () => void;
}) {
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) =>
    onChange({ ...settings, [key]: value });

  // Temperature is inert when extended thinking is on (API forces 1) or the model
  // deprecated the parameter (API rejects it — and for custom models we can't know, so it's
  // omitted). modelDeprecatesTemp takes precedence in the readout because it can't be
  // toggled off the way thinking can.
  const modelDeprecatesTemp = !supportsTemperature(effectiveModel(settings));
  const tempInert = settings.thinking || modelDeprecatesTemp;

  // Escape closes the drawer while it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      {/* Scrim — dims the workbench and closes the drawer on click. */}
      <div
        onClick={onClose}
        aria-hidden
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* The sidebar itself — a full-height drawer that slides in from the left. */}
      <aside
        aria-hidden={!open}
        aria-label="Run settings"
        className={`fixed left-0 top-0 z-50 flex h-full w-[360px] max-w-[92vw] flex-col border-r border-[var(--line-2)] bg-[var(--bg-2)] shadow-[0_0_60px_rgba(0,0,0,0.6)] transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-4">
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-1)]">
            ⚙ Settings
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--line-2)] bg-[var(--panel)] font-mono text-[12px] text-[var(--ink-2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--ink-1)]"
          >
            ✕
          </button>
        </div>

        {/* Scrollable body — the sections stack vertically, one concern per band. */}
        <div className="flex flex-1 flex-col gap-7 overflow-y-auto px-5 py-5">
          {/* ── Model ───────────────────────────────────────────────── */}
          <Section title="Model">
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Model</label>
              <select
                value={settings.model}
                onChange={(e) => set("model", e.target.value as ModelId)}
                className={fieldCls}
              >
                {(Object.entries(MODELS) as [ModelId, ModelInfo][]).map(([id, info]) => (
                  <option key={id} value={id} className="font-mono">
                    {info.label} · ${info.inputCost}/${info.outputCost} per 1M
                  </option>
                ))}
              </select>
            </div>

            {/* Custom model — any gateway slug, overrides the dropdown when filled */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Custom model</label>
              <input
                type="text"
                value={settings.customModel}
                onChange={(e) => set("customModel", e.target.value)}
                placeholder="creator/model · blank uses the dropdown"
                className={fieldCls}
              />
              {settings.customModel.trim() && !isWellFormedModelId(settings.customModel.trim()) ? (
                <span className="font-mono text-[9px] text-red-400">
                  not a valid slug — expected creator/model (e.g. mistralai/mistral-large-3)
                </span>
              ) : (
                <span className={helpCls}>
                  any OpenRouter slug (e.g. mistralai/mistral-large-3) — needs your own gateway key
                  below; cost unknown, temperature inert
                </span>
              )}
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
              <span className={helpCls}>
                {modelDeprecatesTemp
                  ? "this model samples at its default — temperature is not configurable"
                  : settings.thinking
                    ? "fixed at 1 while extended thinking is on"
                    : "0 = deterministic · 1 = most varied"}
              </span>
            </div>

            {/* Extended thinking */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Extended thinking</label>
              <Toggle
                checked={settings.thinking}
                onClick={() => set("thinking", !settings.thinking)}
              />
            </div>
          </Section>

          {/* ── Graph scope ─────────────────────────────────────────── */}
          <Section title="Graph scope">
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
              <span className={helpCls}>
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
              <span className={helpCls}>resolving questions each claim fans out into</span>
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
              <span className={helpCls}>
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
              <span className={helpCls}>
                chars of each source read · billed per page, so deeper is ~free
              </span>
            </div>
          </Section>

          {/* ── Retrieval ───────────────────────────────────────────── */}
          <Section title="Retrieval">
            {/* Deep search — Exa's agentic retrieval; opt-in for hard / low-coverage claims */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Deep search</label>
              <Toggle
                checked={settings.deepSearch}
                onClick={() => set("deepSearch", !settings.deepSearch)}
              />
              <span className={helpCls}>
                agentic multi-step retrieval · higher recall, slower, pricier
              </span>
            </div>

            {/* Depth mode — trace each claim to its origin by following links, vs the breadth fan-out */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Depth mode</label>
              <Toggle
                checked={settings.depthMode}
                onClick={() => set("depthMode", !settings.depthMode)}
                onLabel="Depth"
                offLabel="Breadth"
              />
              <span className={helpCls}>
                follow each source&apos;s links toward the originating report instead of fanning out
                · renders as the spiral view
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
                <option value="" className="font-mono">
                  Any source
                </option>
                {EXA_CATEGORIES.map((c) => (
                  <option key={c} value={c} className="font-mono">
                    {c[0].toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
              <span className={helpCls}>
                restrict retrieval · cleaner extraction, but narrows recall
              </span>
            </div>

            {/* Content freshness — opt into live crawling instead of Exa's cache */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Prefer fresh content</label>
              <Toggle
                checked={settings.preferFresh}
                onClick={() => set("preferFresh", !settings.preferFresh)}
                onLabel="Live crawl"
                offLabel="Cached"
              />
              <span className={helpCls}>
                live-crawl over cache · fresher for breaking news, but slower
              </span>
            </div>

            {/* Fact-check short-circuit — resolve a claim from an existing fact-checker verdict */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Fact-check short-circuit</label>
              <Toggle
                checked={settings.factCheckShortCircuit}
                onClick={() => set("factCheckShortCircuit", !settings.factCheckShortCircuit)}
              />
              <span className={helpCls}>
                resolve a claim from an existing Google Fact Check verdict, skipping de-novo
                retrieval
              </span>
            </div>
          </Section>

          {/* ── Display ─────────────────────────────────────────────── */}
          <Section title="Display">
            {/* Minimap — display-only; the navigator thumbnail in the graph corner */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Minimap</label>
              <Toggle
                checked={settings.showMinimap}
                onClick={() => set("showMinimap", !settings.showMinimap)}
              />
              <span className={helpCls}>navigator thumbnail in the graph corner</span>
            </div>

            {/* Withhold verdict — hide the machine's aggregate verdict so the user concludes */}
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Withhold verdict</label>
              <Toggle
                checked={settings.withholdVerdict}
                onClick={() => set("withholdVerdict", !settings.withholdVerdict)}
              />
              <span className={helpCls}>
                hide the machine&apos;s aggregate verdict so you read the evidence and conclude
                yourself
              </span>
            </div>
          </Section>

          {/* ── API keys ────────────────────────────────────────────── */}
          <Section title="API keys">
            <div className="flex flex-col gap-1.5">
              <label className={labelCls}>Optional · stored in this browser</label>
              <div className="flex flex-col gap-2">
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={settings.gatewayKey}
                  onChange={(e) => set("gatewayKey", e.target.value)}
                  placeholder="OPENROUTER_API_KEY · blank uses server default"
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
                  placeholder="GOOGLE_FACT_CHECK_API_KEY · blank uses server default"
                  className={fieldCls}
                />
                <input
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  value={settings.cohereKey}
                  onChange={(e) => set("cohereKey", e.target.value)}
                  placeholder="COHERE_API_KEY · blank uses server default"
                  className={fieldCls}
                />
              </div>
              <span className={helpCls}>
                Sent only with your check requests and used in-memory; never stored on the server.
              </span>
            </div>
          </Section>
        </div>
      </aside>
    </>
  );
}
