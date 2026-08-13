"use client";

import { useEffect, useRef, useState } from "react";
import FactGraphCanvas from "./fact-graph";
import RunReport from "./run-report";
import { SettingsPanel, DEFAULT_SETTINGS, effectiveModel, type Settings } from "./settings-panel";
import { RunErrorModal } from "./run-error-modal";
import { useIsMobile } from "./use-is-mobile";
import { DEFAULT_MODEL, MODELS, modelInfo, supportsTemperature } from "@/lib/run-config";
import { MOCK_GRAPH } from "@/lib/mock-graph";
import type { FactGraph, ClaimItem } from "@/lib/graph-types";
import type { PipelineEvent } from "@/lib/pipeline/events";
import { applyEvent, emptyGraph } from "@/lib/apply-event";
import { sourceVerdict, tallyClaims } from "@/lib/pipeline/verdict";
import { isRelevanceDropped } from "@/lib/pipeline/claim-status";

// Persist run settings (model / temperature / thinking + the user's optional API keys)
// in this browser, so a tester's configuration survives reloads.
const SETTINGS_KEY = "veritrace.settings";

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    // Pick ONLY known Settings keys off the stored blob. This both applies defaults for new
    // fields and drops fields a previous version persisted — in particular the pre-ADR-0012
    // per-provider API keys, which must not keep being rewritten to localStorage forever.
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const settings = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
      if (key in parsed) (settings as Record<string, unknown>)[key] = parsed[key];
    }
    // Settings persisted before ADR 0012 carry pre-gateway model ids (not gateway slugs),
    // which the API now rejects — reset those to the default rather than 400 every run.
    if (!(settings.model in MODELS)) settings.model = DEFAULT_MODEL;
    return settings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// Curated demo posts (real viral misinformation, text-native) — see demo-corpus/SOURCES.md.
// The El Mencho story is the de-novo hero; the others give textured mixed-verdict graphs.
// `country` (flag + ISO code) is shown on the chip so the example's origin reads at a glance (#21).
const EXAMPLES: { label: string; text: string; country: string }[] = [
  {
    label: "El Mencho · GDL airport",
    country: "🇲🇽 MX",
    text: "ÚLTIMA HORA: Tras la muerte de 'El Mencho' el 22 de febrero, comandos armados del CJNG tomaron por asalto el Aeropuerto Internacional de Guadalajara y mantienen como rehenes a turistas estadounidenses. Mientras tanto, Puerto Vallarta arde en llamas.",
  },
  {
    label: "Springfield · pets",
    country: "🇺🇸 US",
    text: "In Springfield, they're eating the dogs. The people that came in, they're eating the cats, they're eating the pets of the people that live there.",
  },
  {
    label: "Shakira · show no Rio",
    country: "🇧🇷 BR",
    text: "URGENTE 🚨 Durante seu show no Rio de Janeiro, Shakira parou no meio da apresentação para declarar apoio a Lula e pediu que a plateia votasse contra Bolsonaro. Milhares de fãs vaiaram e o vídeo já viralizou nas redes!",
  },
  {
    label: "Pfizer · hantavírus",
    country: "🇧🇷 BR",
    text: "Documento oficial da própria Pfizer cita o hantavírus como reação adversa da vacina contra a Covid-19. Eles sabiam o tempo todo e esconderam de todo mundo. Compartilhe antes que apaguem!",
  },
];

export default function Workbench() {
  const [text, setText] = useState("");
  const [graph, setGraph] = useState<FactGraph>(MOCK_GRAPH);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Non-fatal run advisory (#100), e.g. every web search failed so the graph degraded to all-NEI.
  // Shown as a dismissible banner over the still-rendered graph, distinct from the fatal-error modal.
  const [warning, setWarning] = useState<string | null>(null);
  const [runId, setRunId] = useState(0);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const isMobile = useIsMobile();
  // Mobile-only: collapse the input zone (textarea + examples + settings) so the evidence
  // graph gets the full small screen. Inert on desktop (md+), where the zone always shows.
  const [inputOpen, setInputOpen] = useState(true);
  // Post-run brief: the left slide-in panel with verdict + ratio + AI summary. The narrative
  // is fetched once per finished run (tracked by summarizedRunIdRef so the effect fires once).
  const [reportOpen, setReportOpen] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const summarizedRunIdRef = useRef(0);

  // Hydrate settings from localStorage after mount (avoids SSR/client mismatch),
  // then persist on every change. The post-mount setState is deliberate: reading
  // localStorage during render would diverge from the server HTML and break hydration.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setSettings(loadSettings()), []);
  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      /* storage unavailable (private mode / quota) — settings just won't persist */
    }
  }, [settings]);

  // The per-run config sent to both /api/check and /api/summary (model + BYO keys).
  function runConfig() {
    return {
      model: effectiveModel(settings),
      temperature: settings.temperature,
      thinking: settings.thinking,
      maxClaims: settings.maxClaims,
      maxQuestions: settings.maxQuestions,
      maxSources: settings.maxSources,
      maxChars: settings.maxChars,
      deepSearch: settings.deepSearch,
      depthMode: settings.depthMode,
      category: settings.category,
      preferFresh: settings.preferFresh,
      factCheckShortCircuit: settings.factCheckShortCircuit,
      gatewayKey: settings.gatewayKey || undefined,
      exaKey: settings.exaKey || undefined,
      googleFactCheckKey: settings.googleFactCheckKey || undefined,
      cohereKey: settings.cohereKey || undefined,
    };
  }

  // Reset the brief when a new run starts so a stale summary never shows for fresh graph.
  function resetReport() {
    setReportOpen(false);
    setSummary(null);
    setSummaryError(null);
    setSummaryLoading(false);
  }

  // Fetch the AI narrative for a finished graph (one call, off the build hot path).
  async function generateSummary(g: FactGraph) {
    setSummaryLoading(true);
    setSummaryError(null);
    setSummary(null);
    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ graph: g, config: runConfig() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      setSummary(data.summary ?? "");
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Could not generate summary");
    } finally {
      setSummaryLoading(false);
    }
  }

  // When a run finishes (verdict resolved, no longer loading), auto-open the brief and
  // generate its narrative once. Guarded by runId so it fires exactly once per run.
  useEffect(() => {
    if (loading || graph.source.verdict === null) return;
    if (summarizedRunIdRef.current === runId) return;
    summarizedRunIdRef.current = runId;
    setReportOpen(true);
    generateSummary(graph);
    // generateSummary/graph captured intentionally — we summarize the finished graph once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, runId, graph.source.verdict]);

  async function check(source: string) {
    const trimmed = source.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    setError(null);
    setWarning(null);
    // On mobile, hand the small screen to the evidence graph the moment a run starts — the
    // input zone has done its job (#6). Desktop keeps it open (the collapse is md:-inert anyway).
    if (isMobile) setInputOpen(false);
    resetReport();
    // Reset to an empty graph for this source; the stream builds it node by node.
    setGraph(emptyGraph(trimmed));
    setRunId((n) => n + 1);

    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, config: runConfig() }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep the trailing partial line
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as PipelineEvent;
          if (ev.type === "error") throw new Error(ev.message);
          if (ev.type === "warning") setWarning(ev.message);
          else setGraph((g) => applyEvent(g, ev));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // Recompute the source-level verdict + tally from the current per-claim verdicts (ADR 0007's
  // relevance-weighted rule). Used after a claim is re-included so the document headline + ratio
  // reflect the newly-checked claim. Dropped claims are excluded from the aggregate and the "of N".
  function withRecomputedSource(g: FactGraph): FactGraph {
    const checked = g.claims.filter((c) => !isRelevanceDropped(c));
    const verdicts = checked.map((c) => c.verdict ?? "nei");
    const weighted = checked.map((c) => ({
      verdict: c.verdict ?? "nei",
      relevanceScore: c.relevanceScore,
    }));
    return {
      ...g,
      source: {
        ...g.source,
        verdict: sourceVerdict(weighted),
        tally: tallyClaims(verdicts, g.claims.length - checked.length),
      },
    };
  }

  // Re-include a relevance-dropped claim (#33): override the filter, then re-resolve just that
  // claim (questions → search → verdict) and merge the streamed events into the existing graph.
  async function reincludeClaim(claim: ClaimItem) {
    if (loading) return;
    setError(null);
    // Optimistically flip it back to searchable + analyzing so the node leaves the dropped style.
    setGraph((g) => ({
      ...g,
      claims: g.claims.map((c) =>
        c.id === claim.id ? { ...c, relevant: true, verdict: null, rationale: undefined } : c,
      ),
    }));
    try {
      const res = await fetch("/api/resolve-claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claim: { id: claim.id, text: claim.text, date: claim.date },
          config: runConfig(),
        }),
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as PipelineEvent;
          if (ev.type === "error") throw new Error(ev.message);
          setGraph((g) => applyEvent(g, ev));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not re-include the claim");
    } finally {
      // Fold the re-included claim's verdict into the document headline + ratio.
      setGraph((g) => withRecomputedSource(g));
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="vt-reveal border-b border-[var(--line)] bg-[var(--bg-2)]/60 px-6 py-3.5">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            {/* Mobile-only collapse toggle. The verbose "the artifact under examination" header
                was dropped (#36) — the textarea placeholder already explains the input; on desktop
                the zone is always open, so no toggle is needed there. */}
            <button
              type="button"
              onClick={() => setInputOpen((o) => !o)}
              aria-expanded={inputOpen}
              aria-label={inputOpen ? "Collapse input" : "Expand input"}
              className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.22em] text-[var(--ink-3)] md:hidden"
            >
              <span className="text-[var(--ink-2)]">{inputOpen ? "▾" : "▸"}</span> Source text
            </button>
            <button
              type="button"
              onClick={() => setShowSettings((s) => !s)}
              aria-expanded={showSettings}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-2)] bg-[var(--panel)] px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[var(--ink-2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--ink-1)]"
            >
              {/* On mobile show only the model — the full temp/claims/q/src strip is meaningless
                  to a first-timer and eats the scarce first screen (#27). Tap to expand settings. */}
              ⚙ Settings: {modelInfo(effectiveModel(settings)).label}
              <span className="hidden sm:inline">
                {" "}
                · temp{" "}
                {!supportsTemperature(effectiveModel(settings))
                  ? "n/a"
                  : settings.thinking
                    ? "1·think"
                    : settings.temperature.toFixed(2)}{" "}
                · ≤{settings.maxClaims} claims · ≤{settings.maxQuestions} q · ≤{settings.maxSources}{" "}
                src · {(settings.maxChars / 1000).toFixed(settings.maxChars % 1000 === 0 ? 0 : 1)}k
                chars{settings.deepSearch ? " · deep" : ""}
                {settings.category ? ` · ${settings.category}` : ""}
                {settings.preferFresh ? " · fresh" : ""}
              </span>
            </button>
          </div>
          {/* Collapsible body: hidden on mobile when retracted, always shown from md up. */}
          <div
            className={inputOpen ? "flex flex-col gap-3" : "hidden md:flex md:flex-col md:gap-3"}
          >
            <div
              className="rounded-lg border bg-[var(--bg)] transition-colors focus-within:border-[var(--accent)]"
              style={{ borderColor: "var(--line-2)" }}
            >
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  // Enter runs the check; Shift+Enter inserts a newline (#22).
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    check(text);
                  }
                }}
                placeholder="A tweet, WhatsApp forward, or Facebook caption… VERITRACE decomposes it into checkable claims and gathers primary sources, live. (Enter to run, Shift+Enter for a new line.)"
                rows={3}
                className="w-full resize-none bg-transparent px-3.5 py-2.5 text-[13.5px] leading-relaxed text-[var(--ink-1)] placeholder:italic placeholder:text-[var(--ink-3)] focus:outline-none"
              />
            </div>
            {/* On mobile the examples become a single horizontal scroll-snap row (instead of four
                full-width stacked rows) and the Run button drops to its own row, reclaiming the
                first screen (#27). From sm+ it's the original inline wrap with Run pushed right. */}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0">
                <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
                  Examples
                </span>
                {EXAMPLES.map((ex, i) => (
                  <button
                    key={ex.label}
                    disabled={loading}
                    onClick={() => {
                      setText(ex.text);
                      check(ex.text);
                    }}
                    className="group inline-flex shrink-0 snap-start items-center gap-1.5 rounded-md border border-[var(--line-2)] bg-[var(--panel)] px-2.5 py-1 font-mono text-[10.5px] text-[var(--ink-2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--ink-1)] disabled:opacity-40"
                  >
                    <span className="text-[var(--ink-4)] group-hover:text-[var(--accent)]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {ex.label}
                    <span className="text-[var(--ink-4)]">·</span>
                    <span className="text-[var(--ink-3)]">{ex.country}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => check(text)}
                disabled={loading || text.trim().length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-md px-4 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#04181b] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:ml-auto"
                style={{
                  background:
                    loading || text.trim().length === 0 ? "var(--line-2)" : "var(--accent)",
                  color: loading || text.trim().length === 0 ? "var(--ink-3)" : "#04181b",
                  boxShadow:
                    loading || text.trim().length === 0 ? "none" : "0 0 18px rgba(58,214,230,0.35)",
                }}
              >
                {loading ? (
                  <>
                    <span className="h-3 w-3 animate-spin rounded-full border-2 border-current/40 border-t-current" />
                    Analyzing
                  </>
                ) : (
                  <>▸ Run check</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Run-fatal errors get a modal (#96), not a missable inline line. Retry re-runs the
          current input; weaker models fail the parse path often enough to need a real surface. */}
      <RunErrorModal
        error={error}
        modelLabel={modelInfo(effectiveModel(settings)).label}
        onDismiss={() => setError(null)}
        onRetry={() => check(text)}
      />

      {/* Non-fatal run advisory (#100): the run finished but its results are unreliable (e.g. every
          web search errored). A banner over the graph, not a blocking modal — the graph still shows,
          but the reader is told the verdicts can't be trusted, so an empty all-NEI graph isn't read
          as a genuine de-novo dead end. */}
      {warning && (
        <div
          role="alert"
          className="flex items-start gap-3 border-b border-[var(--amber,#b6822a)]/40 bg-[var(--amber,#b6822a)]/10 px-6 py-2.5 text-[12px] leading-relaxed text-[var(--ink-1)]"
        >
          <span aria-hidden className="mt-px shrink-0 text-[var(--amber,#b6822a)]">
            ⚠
          </span>
          <p className="flex-1">{warning}</p>
          <button
            type="button"
            onClick={() => setWarning(null)}
            aria-label="Dismiss warning"
            className="shrink-0 font-mono text-[11px] text-[var(--ink-3)] transition-colors hover:text-[var(--ink-1)]"
          >
            ✕
          </button>
        </div>
      )}

      <main className="relative flex-1">
        <FactGraphCanvas
          key={runId}
          graph={graph}
          showMinimap={settings.showMinimap}
          withholdVerdict={settings.withholdVerdict}
          depthMode={settings.depthMode}
          onReinclude={reincludeClaim}
        />
        <RunReport
          graph={graph}
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          summary={summary}
          summaryLoading={summaryLoading}
          summaryError={summaryError}
          withholdVerdict={settings.withholdVerdict}
        />
        {/* Reopen the brief once a run has resolved and the panel is closed. */}
        {!reportOpen && !loading && runId > 0 && graph.source.verdict !== null && (
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="absolute left-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] shadow-xl backdrop-blur transition-colors hover:border-[var(--accent)] hover:text-[var(--ink-1)]"
            style={{
              borderColor: "var(--line-2)",
              background: "rgba(11,14,21,0.9)",
              color: "var(--ink-2)",
            }}
          >
            ▣ Brief
          </button>
        )}
        {/* The canvas is pre-filled with the El Mencho MOCK_GRAPH on first load; label it as a
            sample so it doesn't read as the user's own result already loading (#28). */}
        {runId === 0 && !loading && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2">
            <div
              className="rounded-full border px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] shadow-lg backdrop-blur"
              style={{
                borderColor: "var(--line-2)",
                background: "rgba(11,14,21,0.85)",
                color: "var(--ink-3)",
              }}
            >
              ▸ Sample analysis — paste your own above
            </div>
          </div>
        )}
        {loading && (
          <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2">
            <div
              className="flex items-center gap-2.5 rounded-full border px-4 py-2 font-mono text-[11px] uppercase tracking-[0.14em] shadow-xl backdrop-blur"
              style={{
                borderColor: "rgba(58,214,230,0.3)",
                background: "rgba(11,14,21,0.9)",
                color: "var(--ink-2)",
              }}
            >
              <span
                className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
              />
              Decomposing claims · gathering primary sources
            </div>
          </div>
        )}
      </main>

      <SettingsPanel
        settings={settings}
        onChange={setSettings}
        open={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </div>
  );
}
