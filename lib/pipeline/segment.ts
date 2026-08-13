import type { ReasoningProvider } from "../reasoner-types";

// SAFE's first move: "split the response into individual facts". Before we judge importance
// or decontextualize, we break the source into the COMPLETE set of atomic utterances it
// asserts — including the presuppositions and entailments a reader takes for granted. That
// granular breakdown is what makes the later relevance filter (triage) legible: the user
// sees every fact the message smuggles in, then sees which ones we actually checked.

/** A single indivisible statement as segmented from the source — not yet decontextualized. */
export interface Utterance {
  text: string; // the atomic statement, in clear English
  original: string; // the source fragment it came from
}

// Upper bound on segmented utterances so a long pasted article can't explode the graph.
// The relevance filter then narrows the *checked* subset further (run-config maxClaims).
export const SEGMENT_CEILING = 16;

const SYSTEM = `You are the SEGMENTATION stage of VERITRACE, a fact-checking pipeline in the document-first tradition (SAFE / FacTool / Loki). You receive a raw "source text" — a tweet, WhatsApp forward, Facebook caption, or pasted article, often viral misinformation.

FIRST, silently repair the source: viral text is full of typos and phonetic misspellings, especially of proper names, programs, and institutions. Read for INTENT and decompose the intended assertion, not the literal misspelling. Fix evident transcription errors of named entities before segmenting — e.g. "bosla familia" → "Bolsa Família" (Brazil's welfare program), "bolsoonaro" → "Bolsonaro", "reacao adversao" → "reação adversa", "hantavirus" stays. Critically: "trocar X por Y" is Portuguese for "swap/replace X FOR/WITH Y" (exchange one thing for another), NOT "replace someone's family". Only fix spelling/transcription — never change the meaning or invent content the source did not assert.

Then decompose it into the COMPLETE set of atomic factual utterances it asserts OR presupposes — one indivisible statement each. Be exhaustive and granular:
- Split conjunctions and lists into separate utterances. "they're eating the dogs, the cats, the pets of the people" → "X are eating dogs", "X are eating cats", "X are eating the residents' pets".
- Split DISJUNCTIONS ("A or B", "A o B", "A ou B") into ONE candidate utterance per alternative — each alternative is a separate claim to be verified independently, since at most one can be true. "Shakira declared support for Lula or Bolsonaro during a show in Rio" → "Shakira declared support for Lula during a show in Rio", "Shakira declared support for Bolsonaro during a show in Rio".
- Surface presuppositions and entailed background as their own utterances, even if obvious. "the immigrants who arrived in Springfield" presupposes "Springfield is a place", "immigrants arrived in Springfield".
- Do NOT merge near-duplicates, do NOT decontextualize (that is the next stage), and do NOT judge importance or check-worthiness — every fact, trivial or not, is listed here.
- Translate each utterance to clear English (the source may be Spanish or other). Keep "original" as the source fragment it came from.

Respond with ONLY a JSON array, no prose:
[{ "text": "<atomic English utterance>", "original": "<source fragment>" }]`;

export async function segmentUtterances(
  sourceText: string,
  ask: ReasoningProvider,
): Promise<Utterance[]> {
  const raw = await ask.askJSON<Utterance[]>(
    `Source text:\n"""\n${sourceText}\n"""\n\nSegment it into atomic utterances as instructed.`,
    { system: SYSTEM, maxTokens: 1500 },
  );

  return raw
    .filter((u) => typeof u?.text === "string" && u.text.trim().length > 0)
    .slice(0, SEGMENT_CEILING)
    .map((u) => ({ text: u.text, original: u.original ?? "" }));
}
