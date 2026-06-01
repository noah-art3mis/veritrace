import { FACT_CHECKERS } from "./exa";
import type { EvidenceItem, Stance, Verdict } from "./graph-types";

// A short-circuit layer over the Google Fact Check Tools API (`claims:search`). Before
// VERITRACE spends a HyDE expansion + an agentic Exa search loop + a classify call per
// question, this asks one cheap question first: has a known fact-checker ALREADY
// adjudicated this claim? On a confident hit we resolve the claim straight from that
// finding and skip all the expensive retrieval.
//
// This is DELIBERATELY OFF by default (RunConfig.factCheckShortCircuit). VERITRACE's
// stated design is de novo — reach its own verdict from primary evidence, never by
// reading a third party's finished fact-check (see lib/exa.ts). The short-circuit
// trades that principle for speed/cost, so it's opt-in and easy to leave off while
// testing the full pipeline.
//
// Docs: https://developers.google.com/fact-check/tools/api/reference/rest/v1alpha1/claims/search
const ENDPOINT = "https://factchecktools.googleapis.com/v1alpha1/claims:search";

// How many of the API's matched claims we look at (it returns them ranked by relevance),
// and the hard cap on review cards we surface per claim — the per-claim analogue of the
// run-config legibility caps. A wall of redundant ratings makes an illegible node.
const MAX_CLAIMS_CONSIDERED = 2;
const MAX_REVIEWS = 4;

/** One fact-check review the API returned, normalized and mapped to our stance vocabulary. */
export interface FactCheckHit {
  /** The claim text the fact-checker reviewed (may differ slightly from ours). */
  claimText: string;
  claimant?: string;
  publisher: string; // human name, e.g. "Snopes"
  site: string; // domain, e.g. "snopes.com"
  url: string; // link to the fact-check article
  title: string;
  reviewDate?: string; // ISO YYYY-MM-DD
  /** The publisher's raw verdict label — free text, e.g. "False", "Pants on Fire". */
  textualRating: string;
  languageCode?: string;
  /** textualRating mapped onto our stance axis. */
  stance: Stance;
  /** Whether `site` is one of VERITRACE's curated FACT_CHECKERS (drives reliability). */
  trusted: boolean;
}

/** Per-run fact-check configuration. */
export interface FactCheckConfig {
  /** User-supplied key; blank ⇒ the server's GOOGLE_FACT_CHECK_API_KEY env. */
  apiKey?: string;
  /** Restrict to a BCP-47 language (e.g. "en", "pt"); omitted = all languages. */
  languageCode?: string;
  /** Only reviews newer than this many days; omitted = no age limit. */
  maxAgeDays?: number;
}

// Verdict labels are free text per publisher, so we match on lowercased substrings. The
// lists cover the common English + Spanish/Portuguese ratings VERITRACE's fact-checkers
// emit. Order matters: refuting labels are checked first because "not true" / "no" must
// not be swallowed by a naive "true" match.
const REFUTING = [
  "false",
  "pants on fire",
  "incorrect",
  "inaccurate",
  "fake",
  "no evidence",
  "misleading",
  "unsupported",
  "distorts",
  "debunked",
  "hoax",
  "not true",
  "falso",
  "enganoso",
  "engañoso",
  "incorreto",
  "incorrecto",
  "mentira",
];
const SUPPORTING = [
  "true",
  "correct",
  "accurate",
  "verified",
  "legit",
  "verdadero",
  "verdadeiro",
  "cierto",
  "certo",
];

/** Map a publisher's free-text rating to our stance. Ambiguous/mixed ⇒ "contextualizes". */
export function ratingToStance(rating: string): Stance {
  const r = rating.toLowerCase();
  // "mostly false" / "mostly true" land on their adjective; check refuting first so
  // negations win. Anything mixed ("half true", "mixture") stays contextualizing.
  if (REFUTING.some((label) => r.includes(label))) return "refutes";
  if (r.includes("half") || r.includes("mixture") || r.includes("mixed")) return "contextualizes";
  if (SUPPORTING.some((label) => r.includes(label))) return "supports";
  return "contextualizes";
}

function trustedSite(site: string): boolean {
  return FACT_CHECKERS.some((d) => site === d || site.endsWith(`.${d}`));
}

function normalizeSite(rawSite: string | undefined, reviewUrl: string): string {
  const candidate = rawSite?.trim() || reviewUrl;
  try {
    // publisher.site can be a bare domain or a full URL; URL() needs a scheme.
    const withScheme = /^https?:\/\//.test(candidate) ? candidate : `https://${candidate}`;
    return new URL(withScheme).hostname.replace(/^www\./, "");
  } catch {
    return candidate.replace(/^www\./, "");
  }
}

// The slice of the Google response we read. Fields are all optional on the wire.
interface GoogleClaimReview {
  publisher?: { name?: string; site?: string };
  url?: string;
  title?: string;
  reviewDate?: string;
  textualRating?: string;
  languageCode?: string;
}
interface GoogleClaim {
  text?: string;
  claimant?: string;
  claimReview?: GoogleClaimReview[];
}

/**
 * Build a fact-check lookup bound to one API key (the user's, or the GOOGLE_FACT_CHECK_API_KEY
 * env fallback). The returned function does one `claims:search` per claim and returns the
 * matched reviews, normalized. Throws here (synchronously) if no key is available, so the API
 * route can answer 400 before opening the stream — mirroring createExaSearch.
 *
 * A lookup FAILURE at call time (network / non-200) throws too; the pipeline catches it and
 * treats it as "no existing fact-check", falling through to de-novo retrieval rather than
 * sinking the whole run on a fact-check hiccup.
 */
export function createFactCheckLookup(
  cfg: FactCheckConfig = {},
): (query: string) => Promise<FactCheckHit[]> {
  const apiKey = cfg.apiKey || process.env.GOOGLE_FACT_CHECK_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_FACT_CHECK_API_KEY is not set (and no key was provided)");
  const { languageCode, maxAgeDays } = cfg;

  return async function lookup(query: string): Promise<FactCheckHit[]> {
    const params = new URLSearchParams({ key: apiKey, query, pageSize: "10" });
    if (languageCode) params.set("languageCode", languageCode);
    if (maxAgeDays) params.set("maxAgeDays", String(maxAgeDays));

    // no-store: the query is dynamic and the route is already uncached; don't let the
    // platform fetch cache memoize a stale "no fact-check found".
    const res = await fetch(`${ENDPOINT}?${params}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fact Check API responded ${res.status}`);

    const data = (await res.json()) as { claims?: GoogleClaim[] };
    const hits: FactCheckHit[] = [];
    for (const claim of (data.claims ?? []).slice(0, MAX_CLAIMS_CONSIDERED)) {
      for (const review of claim.claimReview ?? []) {
        if (!review.url || !review.textualRating) continue; // unusable without a link + rating
        const site = normalizeSite(review.publisher?.site, review.url);
        hits.push({
          claimText: claim.text ?? "",
          claimant: claim.claimant,
          publisher: review.publisher?.name || site,
          site,
          url: review.url,
          title: review.title || `${review.publisher?.name || site}: ${review.textualRating}`,
          reviewDate: review.reviewDate?.slice(0, 10),
          textualRating: review.textualRating,
          languageCode: review.languageCode,
          stance: ratingToStance(review.textualRating),
          trusted: trustedSite(site),
        });
        if (hits.length >= MAX_REVIEWS) return hits;
      }
    }
    return hits;
  };
}

/**
 * Turn fact-check hits into EvidenceItems attached to a (synthetic) question node, so the
 * short-circuit renders in the graph like any other resolved question. A finished fact-check
 * is NEVER a primary source (it adjudicates the claim, it didn't originate the event), so
 * sourceType is always "secondary" — matching the classifier's stated rule. Reliability is
 * "high" for a curated FACT_CHECKERS outlet, "medium" otherwise; a clear stance gets high
 * confidence so it can move the verdict, while an ambiguous/mixed rating stays contextual.
 */
export function factCheckEvidence(hits: FactCheckHit[], questionId: string): EvidenceItem[] {
  return hits.map((h, i) => ({
    id: `${questionId}-e${i + 1}`,
    questionId,
    title: h.title,
    url: h.url,
    domain: h.site,
    faviconUrl: `https://www.google.com/s2/favicons?domain=${h.site}&sz=64`,
    publishedDate: h.reviewDate,
    passage: `${h.publisher} rated this "${h.textualRating}"${h.claimText ? ` — reviewing: ${h.claimText}` : ""}`,
    stance: h.stance,
    reliability: h.trusted ? "high" : "medium",
    sourceType: "secondary",
    stanceConfidence: h.stance === "contextualizes" ? 0.4 : 0.9,
  }));
}

/** A one-line "why" for a short-circuited claim — names the adjudicating publisher(s) and rating. */
export function factCheckRationale(verdict: Verdict, hits: FactCheckHit[]): string {
  const deciding = hits.filter((h) => h.stance !== "contextualizes");
  const publishers = [...new Set(deciding.map((h) => h.publisher))];
  const who =
    publishers.length === 0
      ? "an existing fact-check"
      : publishers.length <= 2
        ? publishers.join(" and ")
        : `${publishers.slice(0, 2).join(", ")} and others`;
  const lead =
    verdict === "refuted" ? "Refuted" : verdict === "supported" ? "Supported" : "Resolved";
  return `${lead} from an existing fact-check by ${who} — de-novo retrieval skipped (short-circuit).`;
}
