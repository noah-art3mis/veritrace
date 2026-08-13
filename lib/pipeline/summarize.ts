import type { FactGraph, Verdict, Stance, Reliability, SourceType } from "../graph-types";
import type { ReasoningProvider } from "../reasoner-types";
import { isRelevanceDropped } from "./claim-status";
import { VERDICT_META } from "../visuals";

// The run-report summary. The graph is rich but only fully legible zoomed-in; this distills
// it into (1) a deterministic quantitative digest and (2) a short AI-written narrative, so a
// reader gets the verdict + the picture without panning the canvas.

export interface GraphDigest {
  /** Checked claims only (relevance-dropped claims are excluded — they were never verified). */
  total: number;
  byVerdict: Record<Verdict, number>;
  dropped: number;
  evidence: {
    total: number;
    byStance: Record<Stance, number>;
    byReliability: Record<Reliability, number>;
    byType: Record<SourceType, number>;
    domains: string[]; // distinct, in first-seen order
  };
}

const VERDICTS: Verdict[] = ["supported", "refuted", "conflicting", "nei"];
const STANCES: Stance[] = ["supports", "refutes", "contextualizes"];
const RELIABILITIES: Reliability[] = ["high", "medium", "low"];
const SOURCE_TYPES: SourceType[] = ["primary", "secondary", "opinion"];

function zero<K extends string>(keys: K[]): Record<K, number> {
  return Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
}

/** Deterministic quantitative roll-up of a finished graph — feeds both the prompt and the UI. */
export function graphDigest(graph: FactGraph): GraphDigest {
  const byVerdict = zero(VERDICTS);
  let total = 0;
  let dropped = 0;
  for (const c of graph.claims) {
    if (isRelevanceDropped(c)) {
      dropped++;
      continue;
    }
    total++;
    byVerdict[c.verdict ?? "nei"]++;
  }

  const byStance = zero(STANCES);
  const byReliability = zero(RELIABILITIES);
  const byType = zero(SOURCE_TYPES);
  const domains: string[] = [];
  for (const e of graph.evidence) {
    byStance[e.stance]++;
    byReliability[e.reliability]++;
    byType[e.sourceType]++;
    if (!domains.includes(e.domain)) domains.push(e.domain);
  }

  return {
    total,
    byVerdict,
    dropped,
    evidence: { total: graph.evidence.length, byStance, byReliability, byType, domains },
  };
}

export const SUMMARY_SYSTEM =
  "You are VERITRACE, a forensic fact-checking engine. You write the closing brief for a " +
  "completed investigation: a tight, plain-language summary a reader can grasp without studying " +
  "the evidence graph. Lead with the bottom line (does the source hold up?), then the decisive " +
  "evidence, then the caveats — conflicts, weak sourcing, or claims that couldn't be checked. " +
  "Be specific and neutral; cite what the evidence shows, not your opinion. No preamble, no " +
  "headings, no bullet lists — 2 to 3 short paragraphs of prose. Never invent facts beyond the " +
  "digest you are given.";

/** Build the user prompt: the source text plus the full claim/evidence digest in plain text. */
export function summaryPrompt(graph: FactGraph): string {
  const d = graphDigest(graph);
  const lines: string[] = [];

  lines.push(`SOURCE TEXT UNDER EXAMINATION:\n"${graph.source.text}"`);
  lines.push("");

  const overall = graph.source.verdict ? VERDICT_META[graph.source.verdict].label : "Undetermined";
  lines.push(
    `OVERALL VERDICT: ${overall} — ${d.byVerdict.supported} of ${d.total} checked claims supported` +
      (d.dropped ? ` (${d.dropped} background claim(s) dropped before checking)` : "") +
      ".",
  );
  lines.push(
    `Verdict spread: ${d.byVerdict.supported} supported, ${d.byVerdict.refuted} refuted, ` +
      `${d.byVerdict.conflicting} conflicting, ${d.byVerdict.nei} not-enough-evidence.`,
  );
  lines.push("");

  lines.push("CLAIMS:");
  const checked = graph.claims.filter((c) => !isRelevanceDropped(c));
  for (const c of checked) {
    const verdict = c.verdict ? VERDICT_META[c.verdict].label : "Unresolved";
    lines.push(`- [${verdict}] ${c.text}`);
    if (c.rationale) lines.push(`    why: ${c.rationale}`);
  }
  lines.push("");

  const ev = d.evidence;
  lines.push(
    `EVIDENCE: ${ev.total} sources across ${ev.domains.length} domains — ` +
      `${ev.byStance.supports} support, ${ev.byStance.refutes} refute, ` +
      `${ev.byStance.contextualizes} contextualize. ` +
      `Reliability: ${ev.byReliability.high} high, ${ev.byReliability.medium} medium, ${ev.byReliability.low} low. ` +
      `Type: ${ev.byType.primary} primary, ${ev.byType.secondary} secondary, ${ev.byType.opinion} opinion.`,
  );
  if (ev.domains.length) lines.push(`Domains: ${ev.domains.join(", ")}.`);
  lines.push("");

  lines.push(
    "Write the closing brief summarizing this investigation for a reader who hasn't seen the graph.",
  );

  return lines.join("\n");
}

/** Generate the narrative summary for a finished graph via one model call. */
export async function summarizeGraph(graph: FactGraph, ask: ReasoningProvider): Promise<string> {
  const text = await ask.askText(summaryPrompt(graph), {
    system: SUMMARY_SYSTEM,
    maxTokens: 700,
  });
  return text.trim();
}
