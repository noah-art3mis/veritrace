"use client";

import type { FactGraph, Verdict } from "@/lib/graph-types";
import { VERDICT_META } from "@/lib/visuals";
import { graphDigest } from "@/lib/pipeline/summarize";

// The post-run brief. Slides in from the right when a run finishes so the reader gets the
// verdict, the support ratio, and an AI-written summary of the qualitative + quantitative
// evidence — without panning or zooming the graph. Verdict/ratio/stats are derived locally
// and instant; the narrative streams in from /api/summary.

const VERDICT_ORDER: Verdict[] = ["supported", "refuted", "conflicting", "nei"];
const VERDICT_SHORT: Record<Verdict, string> = {
  supported: "supported",
  refuted: "refuted",
  conflicting: "conflicting",
  nei: "NEI",
};

/** Stacked bar of the per-verdict claim split — the "X of N" support ratio at a glance. */
function RatioBar({ graph }: { graph: FactGraph }) {
  const d = graphDigest(graph);
  if (d.total === 0) return null;
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full border border-[var(--line-2)]">
        {VERDICT_ORDER.map((v) => {
          const n = d.byVerdict[v];
          if (!n) return null;
          return (
            <div
              key={v}
              style={{ width: `${(n / d.total) * 100}%`, background: VERDICT_META[v].color }}
              title={`${n} ${VERDICT_SHORT[v]}`}
            />
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[9.5px] uppercase tracking-wider">
        {VERDICT_ORDER.filter((v) => d.byVerdict[v] > 0).map((v) => (
          <span
            key={v}
            className="inline-flex items-center gap-1.5"
            style={{ color: VERDICT_META[v].color }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: VERDICT_META[v].color }}
            />
            {d.byVerdict[v]} {VERDICT_SHORT[v]}
          </span>
        ))}
        {d.dropped > 0 && <span className="text-[var(--ink-3)]">▽ {d.dropped} dropped</span>}
      </div>
    </div>
  );
}

/** One-line evidence roll-up: sources, primary share, domains. */
function EvidenceStats({ graph }: { graph: FactGraph }) {
  const { evidence: ev } = graphDigest(graph);
  if (ev.total === 0) return null;
  return (
    <div className="grid grid-cols-3 gap-2">
      {[
        { label: "sources", value: ev.total },
        { label: "primary", value: ev.byType.primary },
        { label: "domains", value: ev.domains.length },
      ].map((s) => (
        <div
          key={s.label}
          className="rounded-md border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-center"
        >
          <div className="font-display text-[20px] leading-none text-[var(--ink-1)]">{s.value}</div>
          <div className="mt-1 font-mono text-[8.5px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}

export interface RunReportProps {
  graph: FactGraph;
  open: boolean;
  onClose: () => void;
  summary: string | null;
  summaryLoading: boolean;
  summaryError: string | null;
  /** Hide the verdict headline, per-verdict ratio, and AI narrative — the "pre-chewed" answer. */
  withholdVerdict?: boolean;
}

export default function RunReport({
  graph,
  open,
  onClose,
  summary,
  summaryLoading,
  summaryError,
  withholdVerdict = false,
}: RunReportProps) {
  const verdict = graph.source.verdict;
  const m = !withholdVerdict && verdict ? VERDICT_META[verdict] : null;

  return (
    <aside
      aria-hidden={!open}
      className="absolute inset-y-0 right-0 z-20 flex w-[400px] max-w-[88vw] flex-col border-l border-[var(--line)] bg-[var(--bg-2)]/95 shadow-2xl backdrop-blur transition-transform duration-300 ease-out"
      style={{ transform: open ? "translateX(0)" : "translateX(100%)" }}
    >
      {/* Header — verdict headline + close. */}
      <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
        <div>
          <div className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
            ▣ Investigation brief
          </div>
          {m && (
            <div className="mt-2 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
              <span
                className="font-display text-[22px] italic leading-none"
                style={{ color: m.color }}
              >
                {m.label}
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close report"
          className="rounded-md border border-[var(--line-2)] bg-[var(--panel)] px-2 py-1 font-mono text-[11px] text-[var(--ink-2)] transition-colors hover:border-[var(--accent)] hover:text-[var(--ink-1)]"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {withholdVerdict ? (
          <p className="font-mono text-[10.5px] leading-[1.6] text-[var(--ink-3)]">
            ▣ Verdict withheld by setting — weigh the evidence below and reach your own conclusion.
          </p>
        ) : (
          <RatioBar graph={graph} />
        )}
        <EvidenceStats graph={graph} />

        {/* AI narrative — withheld alongside the verdict; it states the conclusion outright. */}
        {!withholdVerdict && (
          <div className="border-t border-[var(--line)] pt-4">
            <div className="mb-2.5 flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.2em] text-[var(--ink-3)]">
              <span style={{ color: "var(--accent)" }}>✦</span> Summary
              {summaryLoading && (
                <span className="ml-auto inline-flex items-center gap-1.5 text-[var(--accent)]">
                  <span className="h-2.5 w-2.5 animate-spin rounded-full border border-current border-t-transparent" />
                  writing
                </span>
              )}
            </div>

            {summaryError && !summaryLoading && (
              <p className="font-mono text-[11px]" style={{ color: "var(--refutes)" }}>
                ⚠ {summaryError}
              </p>
            )}

            {summaryLoading && !summary && (
              <div className="space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="vt-shimmer h-3 rounded bg-[var(--panel-2)]"
                    style={{ width: `${[96, 88, 92, 70, 84][i]}%` }}
                  />
                ))}
              </div>
            )}

            {summary && (
              <div className="space-y-3 text-[13px] leading-[1.6] text-[var(--ink-1)]">
                {summary.split(/\n{2,}/).map((para, i) => (
                  <p key={i}>{para.trim()}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
