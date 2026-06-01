"use client";

import { useEffect, useRef, useState } from "react";
import FactGraphCanvas from "./fact-graph";
import RunReport from "./run-report";
import { SettingsPanel, DEFAULT_SETTINGS, type Settings } from "./settings-panel";
import { MODELS, supportsTemperature } from "@/lib/run-config";
import { MOCK_GRAPH } from "@/lib/mock-graph";
import type { FactGraph } from "@/lib/graph-types";
import type { PipelineEvent } from "@/lib/pipeline/events";
import { applyEvent, emptyGraph } from "@/lib/apply-event";
import { DEMO_CACHE } from "@/lib/demo-cache";
import { graphToEvents } from "@/lib/replay";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Persist run settings (model / temperature / thinking + the user's optional API keys)
// in this browser, so a tester's configuration survives reloads.
const SETTINGS_KEY = "veritrace.settings";

function loadSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

// Curated demo posts (real viral misinformation, text-native) — see demo-corpus/SOURCES.md.
// The El Mencho story is the de-novo hero; the others give textured mixed-verdict graphs.
const EXAMPLES: { label: string; text: string }[] = [
  {
    label: "El Mencho · GDL airport",
    text: "ÚLTIMA HORA: Tras la muerte de 'El Mencho' el 22 de febrero, comandos armados del CJNG tomaron por asalto el Aeropuerto Internacional de Guadalajara y mantienen como rehenes a turistas estadounidenses. Mientras tanto, Puerto Vallarta arde en llamas.",
  },
  {
    label: "Springfield · pets",
    text: "In Springfield, they're eating the dogs. The people that came in, they're eating the cats, they're eating the pets of the people that live there.",
  },
  {
    label: "Shakira · show no Rio",
    text: "URGENTE 🚨 Durante seu show no Rio de Janeiro, Shakira parou no meio da apresentação para declarar apoio a Lula e pediu que a plateia votasse contra Bolsonaro. Milhares de fãs vaiaram e o vídeo já viralizou nas redes!",
  },
  {
    label: "Pfizer · hantavírus",
    text: "Documento oficial da própria Pfizer cita o hantavírus como reação adversa da vacina contra a Covid-19. Eles sabiam o tempo todo e esconderam de todo mundo. Compartilhe antes que apaguem!",
  },
];

export default function Workbench() {
  const [text, setText] = useState("");
  const [graph, setGraph] = useState<FactGraph>(MOCK_GRAPH);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [runId, setRunId] = useState(0);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  // Mobile-only: collapse the input zone (textarea + specimens + settings) so the evidence
  // graph gets the full small screen. Inert on desktop (md+), where the zone always shows.
  const [inputOpen, setInputOpen] = useState(true);
  // Post-run brief: the left slide-in panel with verdict + ratio + AI summary. The narrative
  // is fetched once per finished run (tracked by summarizedRunIdRef so the effect fires once).
  const [reportOpen, setReportOpen] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const summarizedRunIdRef = useRef(0);
  // Tracks the in-flight live run so it can be aborted/superseded if needed.
  const abortRef = useRef<AbortController | null>(null);

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
      model: settings.model,
      temperature: settings.temperature,
      thinking: settings.thinking,
      maxClaims: settings.maxClaims,
      maxQuestions: settings.maxQuestions,
      maxSources: settings.maxSources,
      maxChars: settings.maxChars,
      deepSearch: settings.deepSearch,
      category: settings.category,
      preferFresh: settings.preferFresh,
      anthropicKey: settings.anthropicKey || undefined,
      exaKey: settings.exaKey || undefined,
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

  // Replay a captured run as a simulated stream — used by the automatic wifi-death
  // fallback when a live run fails. The caller owns loading / runId.
  async function replayCached(trimmed: string, fallback: FactGraph) {
    setCached(true);
    setGraph(emptyGraph(trimmed));
    for (const { event, delay } of graphToEvents(fallback)) {
      await sleep(delay);
      if (event.type !== "error" && event.type !== "done") {
        setGraph((g) => applyEvent(g, event));
      }
    }
  }

  async function check(source: string) {
    const trimmed = source.trim();
    if (!trimmed || loading) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setError(null);
    setCached(false);
    resetReport();
    // Reset to an empty graph for this source; the stream builds it node by node.
    setGraph(emptyGraph(trimmed));
    setRunId((n) => n + 1);

    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
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
          setGraph((g) => applyEvent(g, ev));
        }
      }
    } catch (err) {
      // Superseded by a manual "Cached" press — that handler now owns the UI.
      if (controller.signal.aborted) return;
      // Wifi-death fallback: if this exact source has a cached run, replay it as a
      // simulated stream so the demo still works offline (PLAN.md top risk).
      const fallback = DEMO_CACHE[trimmed];
      if (fallback) {
        await replayCached(trimmed, fallback);
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      // When aborted, the manual handler controls loading — don't clear it here.
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="vt-reveal border-b border-[var(--line)] bg-[var(--bg-2)]/60 px-6 py-3.5">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setInputOpen((o) => !o)}
              aria-expanded={inputOpen}
              aria-label={inputOpen ? "Collapse input" : "Expand input"}
              className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.22em] text-[var(--ink-3)] md:cursor-default"
            >
              <span className="md:hidden text-[var(--ink-2)]">{inputOpen ? "▾" : "▸"}</span>▣ Paste
              source text · the artifact under examination
            </button>
            <button
              type="button"
              onClick={() => setShowSettings((s) => !s)}
              aria-expanded={showSettings}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--line-2)] bg-[var(--panel)] px-2.5 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[var(--ink-2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--ink-1)]"
            >
              ⚙ {MODELS[settings.model]} · temp{" "}
              {!supportsTemperature(settings.model)
                ? "n/a"
                : settings.thinking
                  ? "1·think"
                  : settings.temperature.toFixed(2)}{" "}
              · ≤{settings.maxClaims} claims · ≤{settings.maxQuestions} q · ≤{settings.maxSources}{" "}
              src · {(settings.maxChars / 1000).toFixed(settings.maxChars % 1000 === 0 ? 0 : 1)}k
              chars{settings.deepSearch ? " · deep" : ""}
              {settings.category ? ` · ${settings.category}` : ""}
              {settings.preferFresh ? " · fresh" : ""}
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
                placeholder="A tweet, WhatsApp forward, or Facebook caption… VERITRACE decomposes it into checkable claims and gathers primary sources, live."
                rows={2}
                className="w-full resize-none bg-transparent px-3.5 py-2.5 text-[13.5px] leading-relaxed text-[var(--ink-1)] placeholder:italic placeholder:text-[var(--ink-3)] focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
                Specimens
              </span>
              {EXAMPLES.map((ex, i) => (
                <button
                  key={ex.label}
                  disabled={loading}
                  onClick={() => {
                    setText(ex.text);
                    check(ex.text);
                  }}
                  className="group inline-flex items-center gap-1.5 rounded-md border border-[var(--line-2)] bg-[var(--panel)] px-2.5 py-1 font-mono text-[10.5px] text-[var(--ink-2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--ink-1)] disabled:opacity-40"
                >
                  <span className="text-[var(--ink-4)] group-hover:text-[var(--accent)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {ex.label}
                </button>
              ))}
              <button
                onClick={() => check(text)}
                disabled={loading || text.trim().length === 0}
                className="ml-auto inline-flex items-center gap-2 rounded-md px-4 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#04181b] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
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
            {error && (
              <p className="font-mono text-[11px]" style={{ color: "var(--refutes)" }}>
                ⚠ {error}
              </p>
            )}
          </div>
        </div>
      </div>

      <main className="relative flex-1">
        <FactGraphCanvas
          key={runId}
          graph={graph}
          showInternals={settings.showInternals}
          showMinimap={settings.showMinimap}
        />
        <RunReport
          graph={graph}
          open={reportOpen}
          onClose={() => setReportOpen(false)}
          summary={summary}
          summaryLoading={summaryLoading}
          summaryError={summaryError}
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
        {cached && (
          <div className="pointer-events-none absolute right-4 top-4 z-10">
            <span
              className="rounded-full border px-3 py-1 font-mono text-[9.5px] uppercase tracking-[0.16em]"
              style={{
                borderColor: "var(--line-2)",
                background: "rgba(11,14,21,0.9)",
                color: "var(--ink-3)",
              }}
            >
              ↺ cached replay · offline
            </span>
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
