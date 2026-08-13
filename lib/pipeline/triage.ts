import type { ReasoningProvider } from "../reasoner-types";
import type { ClaimItem } from "../graph-types";
import type { Utterance } from "./segment";
import { auditDecontextualization } from "./audit";

// SAFE's second + third moves, fused into one pass over the segmented utterances:
// DECONTEXTUALIZE each into a self-contained, searchable claim, and RELEVANCE-FILTER it —
// decide whether it is the load-bearing assertion worth checking or trivial background the
// segmenter surfaced. The granular list comes in; an annotated, prioritized list goes out.

interface Triaged {
  text: string; // decontextualized, self-contained English claim
  checkable?: boolean;
  checkworthy?: boolean;
  relevance?: number; // 0..1 — how load-bearing / contested (replaces the old binary `relevant`)
  date?: string | null;
}

/** Clamp a model-supplied score into [0, 1]; non-numbers fall back to fully relevant. */
function clamp01(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 1;
}

function buildSystem(maxClaims: number): string {
  return `You are the TRIAGE stage of VERITRACE. You receive the original "source text" and the atomic utterances segmented from it. For EACH utterance, in the SAME ORDER, produce one object:

- "text": DECONTEXTUALIZE the utterance into a self-contained, searchable English claim — inject the date, place, and actor from the source so it stands alone ("they seized the airport" → "Armed CJNG members seized Guadalajara International Airport around 22 February 2026"). Do NOT invent specifics (names, numbers, institutions) absent from the source — over-specification is a failure. PRESERVE QUANTIFIER SCOPE exactly as the source states it: do not inflate a single actor into a group or a group into "everyone", and do not narrow a group to one person. If the source says "protesters threatened X" keep it as the collective claim "protesters [plural] threatened X" — it is a DIFFERENT claim from "a protester threatened X", and the evidence required to support each differs.
- "relevance": a 0.0–1.0 score of how LOAD-BEARING and contested this claim is — how central it is to what a fact-check of this source would set out to verify. Use 1.0 for the central contested assertion(s); mid-range for secondary-but-real claims; and 0.0 for trivial, uncontested background, presuppositions, or entailments nobody disputes ("Springfield is a city", "the city has residents", "immigrants exist"). ALSO score 0.0 for any utterance that RESTATES another you are scoring higher — the same proposition in different words, or the same claim plus a modifier already implied by it ("X promised Y" vs "X promised Y if elected" when the source's promise was already conditional). Two claims are distinct only if they could independently be true or false; give only ONE of a set of restatements a non-zero score. CRUCIALLY, when the source bundles a contested assertion with an uncontested BACKGROUND PREMISE about the same actors — e.g. "Imran Khan criticized Macron" alongside the disputed "183 visas were cancelled, 118 deported" — score ONLY the contested assertion; the background premise that merely sets up or accompanies the contested claim is 0.0, because if it slips through as a true, supported claim it can flip the whole document's verdict. We search the highest-scored claims first (up to ${maxClaims} per run); low-relevance claims are shown but never searched.
- "checkable": true if verifiable from text + web search (events, existence, official actions/denials, statements). false if verifying would require inspecting pixels or media provenance ("this video shows X", "the city is in flames" resting on an image).
- "checkworthy": true if a verifiable factual assertion. false if subjective — opinion, value judgement, prediction, or rhetorical flourish.
- "date": the ISO date (YYYY-MM-DD) of the event. Infer it even when not stated verbatim: use explicit dates, relative cues ("yesterday", "last week"), and the present period anchored by the provided "Today's date" for clearly current/breaking events. Use null ONLY when the claim is a standing fact with no single event date or the timing is genuinely unknowable — do not default to null for an obviously recent event.

Respond with ONLY a JSON array, one object per utterance IN THE SAME ORDER, no prose:
[{ "text": "<decontextualized claim>", "checkable": true|false, "checkworthy": true|false, "relevance": 0.0, "date": "YYYY-MM-DD"|null }]`;
}

export async function triageUtterances(
  sourceText: string,
  utterances: Utterance[],
  ask: ReasoningProvider,
  maxClaims: number,
  asOf?: string,
): Promise<ClaimItem[]> {
  if (utterances.length === 0) return [];

  const list = utterances.map((u, i) => `[${i}] ${u.text}`).join("\n");
  // Anchor date inference to the caller's as-of date when given (an eval gold's claimDate);
  // otherwise the wall clock, for a freshly-pasted claim. This keeps a historical claim from
  // being anchored to "now" and pulling post-claim sources.
  const today = asOf ?? new Date().toISOString().slice(0, 10);
  const triaged = await ask.askJSON<Triaged[]>(
    `Today's date: ${today}.\n\nSource text:\n"""\n${sourceText}\n"""\n\nSegmented utterances:\n${list}\n\nTriage each utterance in order.`,
    { system: buildSystem(maxClaims), maxTokens: 2048 },
  );

  const claims = utterances.map((u, i) => {
    // A missing entry defaults to a searchable claim carrying the raw utterance text —
    // better to over-check a possibly-load-bearing claim than to silently drop it.
    const t = triaged[i] ?? {};
    const text = typeof t.text === "string" && t.text.trim().length > 0 ? t.text : u.text;
    const injected = auditDecontextualization(sourceText, text);
    return {
      id: `c${i + 1}`,
      text,
      original: u.original,
      checkable: t.checkable !== false,
      checkworthy: t.checkworthy !== false,
      relevant: true, // provisional — capSearchable derives the final gate from the ranking
      relevanceScore: clamp01(t.relevance),
      // Model's own inference wins; fall back to the as-of date so retrieval is still
      // windowed when the model can't date a decontextualised claim (#55 temporal-leakage fix).
      date: t.date ?? asOf ?? undefined,
      injected: injected.length > 0 ? injected : undefined,
      verdict: null,
    } satisfies ClaimItem;
  });

  return capSearchable(claims, maxClaims);
}

// Minimum relevance for a claim to be searched/aggregated (#52, refining ADR 0005). A claim below
// the floor is trivial background, a presupposition, or an entailed premise — not the contested,
// load-bearing assertion — so it is shown but never searched, and never enters sourceVerdict.
// Without this, a true-but-irrelevant premise ("X criticized Y") scored mildly relevant by the
// model rode alongside the contested numbers and flipped the whole document to conflicting. The
// floor is the deterministic backstop to the prompt's "score background 0.0" instruction; it
// catches the low-but-nonzero mis-scores the prompt alone can't guarantee.
const RELEVANCE_FLOOR = 0.3;

// Relevance-ordered selection (ADR 0005). Rank the type-searchable, above-floor claims by their
// relevance score and keep the top `maxClaims` — so the most load-bearing claims make the cut
// rather than whichever happened to appear first. A score below RELEVANCE_FLOOR is trivial
// background / a restatement and is dropped regardless of the cap. Non-type-searchable claims
// (opinion / media-provenance) keep relevant:true so their drop reason renders as uncheckable /
// uncheckworthy (not "irrelevant") and they never consume a slot. The sort is stable, so ties
// fall back to source order — keeping selection deterministic for the pipeline tests.
function capSearchable(claims: ClaimItem[], maxClaims: number): ClaimItem[] {
  const isTypeSearchable = (c: ClaimItem) => c.checkable && c.checkworthy !== false;
  const candidates = claims.filter(
    (c) => isTypeSearchable(c) && (c.relevanceScore ?? 1) >= RELEVANCE_FLOOR,
  );
  const kept = new Set(
    [...candidates]
      .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0))
      .slice(0, maxClaims),
  );
  for (const claim of claims) {
    if (isTypeSearchable(claim)) claim.relevant = kept.has(claim);
  }
  return claims;
}
