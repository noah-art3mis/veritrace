"use client";

import { useState } from "react";
import type { Verdict, Stance, Reliability } from "@/lib/graph-types";
import { VERDICT_META, STANCE_META, RELIABILITY_META } from "@/lib/visuals";

// Colour↔meaning key for the graph. Every saturated colour also carries a non-colour cue (a
// glyph for verdict/stance, lit bars for reliability), so a node is decodable without seeing hue
// — the colourblind-safe path (WCAG 1.4.1). Driven entirely off lib/visuals.ts, so the key can
// never drift from the palette it documents. Collapsed by default to stay out of the way.

const VERDICTS: Verdict[] = ["supported", "refuted", "conflicting", "nei"];
const STANCES: Stance[] = ["supports", "refutes", "contextualizes"];
const RELIABILITIES: Reliability[] = ["high", "medium", "low"];

function Swatch({ color, glyph }: { color: string; glyph: string }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-3.5 w-3.5 flex-none items-center justify-center rounded-full text-[8px] font-bold leading-none"
      style={{ background: `${color}22`, border: `1.5px solid ${color}`, color }}
    >
      {glyph}
    </span>
  );
}

/* The reliability halo encoded as lit bars (the radial halo's non-colour twin). */
function Bars({ level, color }: { level: 1 | 2 | 3; color: string }) {
  return (
    <span
      aria-hidden
      className="inline-flex h-3.5 w-3.5 flex-none items-end justify-center gap-[2px]"
    >
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className="w-[3px] rounded-[1px]"
          style={{ height: `${3 + i * 2}px`, background: i <= level ? color : "var(--line-2)" }}
        />
      ))}
    </span>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-4)]">
        {title}
      </div>
      {children}
    </div>
  );
}

function Item({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[10px] text-[var(--ink-2)]">
      {children}
      <span>{label}</span>
    </div>
  );
}

export function GraphLegend() {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Show the colour key"
        className="rounded-md border border-[var(--line)] bg-[var(--panel-2)] px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-2)] shadow-lg hover:bg-[var(--line)]"
      >
        ⊕ Key
      </button>
    );
  }

  return (
    <div className="flex w-[200px] flex-col gap-3 rounded-md border border-[var(--line)] bg-[var(--panel)]/95 p-3 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-[var(--ink-3)]">
          ⊕ Colour key
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Hide the colour key"
          className="font-mono text-[10px] text-[var(--ink-3)] hover:text-[var(--ink-1)]"
        >
          ✕
        </button>
      </div>

      <Section title="Verdict (Source · Claim)">
        {VERDICTS.map((v) => (
          <Item key={v} label={VERDICT_META[v].label}>
            <Swatch color={VERDICT_META[v].color} glyph={VERDICT_META[v].glyph} />
          </Item>
        ))}
      </Section>

      <Section title="Stance (Evidence)">
        {STANCES.map((s) => (
          <Item key={s} label={STANCE_META[s].label}>
            <Swatch color={STANCE_META[s].color} glyph={STANCE_META[s].glyph} />
          </Item>
        ))}
      </Section>

      <Section title="Reliability (halo)">
        {RELIABILITIES.map((r) => (
          <Item key={r} label={RELIABILITY_META[r].label}>
            <Bars level={RELIABILITY_META[r].level} color={RELIABILITY_META[r].color} />
          </Item>
        ))}
      </Section>
    </div>
  );
}
