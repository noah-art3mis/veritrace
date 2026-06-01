import type { AnthropicCaller } from "../anthropic";
import type { ClaimItem } from "../graph-types";
import type { Utterance } from "./segment";
import { auditDecontextualization } from "./audit";
import { isSearchable } from "./claim-status";

// SAFE's second + third moves, fused into one pass over the segmented utterances:
// DECONTEXTUALIZE each into a self-contained, searchable claim, and RELEVANCE-FILTER it —
// decide whether it is the load-bearing assertion worth checking or trivial background the
// segmenter surfaced. The granular list comes in; an annotated, prioritized list goes out.

interface Triaged {
  text: string; // decontextualized, self-contained English claim
  checkable?: boolean;
  checkworthy?: boolean;
  relevant?: boolean;
  date?: string | null;
}

function buildSystem(maxClaims: number): string {
  return `You are the TRIAGE stage of VERITRACE. You receive the original "source text" and the atomic utterances segmented from it. For EACH utterance, in the SAME ORDER, produce one object:

- "text": DECONTEXTUALIZE the utterance into a self-contained, searchable English claim — inject the date, place, and actor from the source so it stands alone ("they seized the airport" → "Armed CJNG members seized Guadalajara International Airport around 22 February 2026"). Do NOT invent specifics (names, numbers, institutions) absent from the source — over-specification is a failure. PRESERVE QUANTIFIER SCOPE exactly as the source states it: do not inflate a single actor into a group or a group into "everyone", and do not narrow a group to one person. If the source says "protesters threatened X" keep it as the collective claim "protesters [plural] threatened X" — it is a DIFFERENT claim from "a protester threatened X", and the evidence required to support each differs.
- "relevant": true if this is a LOAD-BEARING, contested assertion — the kind of claim a fact-check exists to verify. false if it is trivial, uncontested background, a presupposition, or an entailment nobody disputes ("Springfield is a city", "the city has residents", "immigrants exist"). ALSO mark relevant:false if this utterance is a RESTATEMENT of another utterance you are already marking relevant:true — the same proposition in different words, or the same claim plus a modifier already implied by it ("X promised Y" vs "X promised Y if elected" when the source's promise was already conditional). Keep only ONE relevant claim per distinct proposition; demote the duplicates. Two claims are distinct only if they could independently be true or false. Mark AT MOST ${maxClaims} utterances relevant — the most load-bearing, distinct ones; everything else is relevant:false. Relevant:false claims are shown but not searched.
- "checkable": true if verifiable from text + web search (events, existence, official actions/denials, statements). false if verifying would require inspecting pixels or media provenance ("this video shows X", "the city is in flames" resting on an image).
- "checkworthy": true if a verifiable factual assertion. false if subjective — opinion, value judgement, prediction, or rhetorical flourish.
- "date": the ISO date (YYYY-MM-DD) of the event. Infer it even when not stated verbatim: use explicit dates, relative cues ("yesterday", "last week"), and the present period anchored by the provided "Today's date" for clearly current/breaking events. Use null ONLY when the claim is a standing fact with no single event date or the timing is genuinely unknowable — do not default to null for an obviously recent event.

Respond with ONLY a JSON array, one object per utterance IN THE SAME ORDER, no prose:
[{ "text": "<decontextualized claim>", "checkable": true|false, "checkworthy": true|false, "relevant": true|false, "date": "YYYY-MM-DD"|null }]`;
}

export async function triageUtterances(
  sourceText: string,
  utterances: Utterance[],
  ask: AnthropicCaller,
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
      relevant: t.relevant !== false,
      // Model's own inference wins; fall back to the as-of date so retrieval is still
      // windowed when the model can't date a decontextualised claim (else undefined).
      date: t.date ?? asOf ?? undefined,
      injected: injected.length > 0 ? injected : undefined,
      verdict: null,
    } satisfies ClaimItem;
  });

  return capSearchable(claims, maxClaims);
}

// Hard backstop on the run's search budget: even if the model marks more than maxClaims
// claims relevant, keep only the first maxClaims searchable ones and demote the overflow to
// relevant:false. Unsearchable claims (opinion / media-provenance) don't consume a slot.
function capSearchable(claims: ClaimItem[], maxClaims: number): ClaimItem[] {
  let kept = 0;
  for (const claim of claims) {
    if (!isSearchable(claim)) continue;
    if (kept < maxClaims) kept += 1;
    else claim.relevant = false;
  }
  return claims;
}
