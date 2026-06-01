// Shared visual vocabulary. Verdict + stance are the only saturated colors in the
// graph (semantic signal); everything else is forensic grayscale + the cyan machine
// accent. Colors are raw hex so cards/edges can compose precise fills, glows, and
// strokes via inline style.
import type { Verdict, Stance, Reliability } from "./graph-types";

export interface VerdictStyle {
  label: string; // editorial verdict word (set in serif by the badge)
  glyph: string; // non-colour cue — a shape that carries the meaning without hue (WCAG 1.4.1)
  color: string; // signal hue
  soft: string; // translucent fill
  glow: string; // shadow tint
}

export const VERDICT_META: Record<Verdict, VerdictStyle> = {
  supported: {
    label: "Supported",
    glyph: "✓",
    color: "#34d399",
    soft: "rgba(52, 211, 153, 0.10)",
    glow: "rgba(52, 211, 153, 0.30)",
  },
  refuted: {
    label: "Refuted",
    glyph: "✗",
    color: "#fb7185",
    soft: "rgba(251, 113, 133, 0.10)",
    glow: "rgba(251, 113, 133, 0.32)",
  },
  conflicting: {
    label: "Conflicting",
    glyph: "⚠",
    color: "#f5b94a",
    soft: "rgba(245, 185, 74, 0.10)",
    glow: "rgba(245, 185, 74, 0.30)",
  },
  nei: {
    label: "Not Enough Evidence",
    glyph: "?",
    color: "#8a94a6",
    soft: "rgba(138, 148, 166, 0.10)",
    glow: "rgba(138, 148, 166, 0.22)",
  },
};

export interface StanceStyle {
  label: string;
  glyph: string; // non-colour cue, distinct from the verdict glyphs (a different axis)
  color: string;
}

export const STANCE_META: Record<Stance, StanceStyle> = {
  supports: { label: "supports", glyph: "+", color: "#34d399" },
  refutes: { label: "refutes", glyph: "−", color: "#fb7185" },
  contextualizes: { label: "context", glyph: "~", color: "#f5b94a" },
};

export interface ReliabilityStyle {
  label: string;
  color: string;
  level: 1 | 2 | 3; // bars lit in the meter
}

export const RELIABILITY_META: Record<Reliability, ReliabilityStyle> = {
  high: { label: "high", color: "#34d399", level: 3 },
  medium: { label: "medium", color: "#f5b94a", level: 2 },
  low: { label: "low", color: "#fb7185", level: 1 },
};

export const ACCENT = "#3ad6e6"; // phosphor cyan — machine activity
