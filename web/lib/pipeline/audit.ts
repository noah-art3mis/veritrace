// Decontextualization audit (FacTool's "evaluate the extractor in isolation"; Molecular
// Facts' over-specification failure). Decontextualization is mandated by the extract stage
// — it injects the date/place/actor so a fragment becomes searchable — but the same step
// can *invent* an unverified specific ("The album" → "The compilation album"), which then
// fails the whole claim spuriously. This flags proper nouns and numbers that appear in the
// decontextualized claim but NOT in the source, for human review.
//
// Caveat: the extractor also TRANSLATES (e.g. Spanish → English), so common nouns won't
// token-match across languages. We deliberately restrict to numbers and capitalized
// proper-noun tokens, which are largely language-invariant (names, places, orgs, dates,
// death tolls) and are exactly the high-risk injected specifics. This is an advisory
// signal, not a hard gate.

// Capitalized proper-noun-ish tokens, ALLCAPS acronyms, or numbers (with separators).
const TOKEN = /\b([A-Z][\p{L}]+|[A-Z]{2,}|\d[\d.,:/-]*\d|\d)\b/gu;

// Sentence/claim openers and connectives that are capitalized but carry no specificity.
const NOISE = new Set([
  "the", "a", "an", "this", "that", "these", "those", "it", "they", "he", "she",
  "armed", "around", "about", "on", "in", "at", "of", "and", "or", "but", "after", "before",
  "according", "reportedly", "allegedly", "several", "some", "many", "most", "near",
]);

function normalize(token: string): string {
  return token.toLowerCase().replace(/[.,:/-]+$/, "");
}

/**
 * Proper nouns / numbers present in `claimText` but absent from `sourceText` — the
 * decontextualizer's likely over-specifications. Empty array = nothing injected (grounded).
 */
export function auditDecontextualization(sourceText: string, claimText: string): string[] {
  const haystack = sourceText.toLowerCase();
  const injected: string[] = [];
  const seen = new Set<string>();

  for (const match of claimText.matchAll(TOKEN)) {
    const token = match[0];
    const norm = normalize(token);
    if (norm.length < 3) continue; // drop tiny tokens (single digits, "a", roman numerals)
    if (NOISE.has(norm)) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    if (!haystack.includes(norm)) injected.push(token);
  }

  return injected;
}
