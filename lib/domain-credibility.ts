import type { Reliability } from "./graph-types";

// Static source-credibility list. Evidence reliability is load-bearing — only high/medium can
// move a Verdict; low can only contextualize (see verdict.ts) — so the trusted tier should not
// be a per-call LLM guess that can drift. This is a curated domain → credibility map in the
// spirit of MBFC / NewsGuard domain-reputation lists, used to OVERRIDE the classifier's
// reliability for domains we recognise. It is deliberately NOT exhaustive: unknown domains still
// fall back to the model's judgement. Additive — extend the lists as new outlets show up.
//
// Tiers:
// - high:   international wires, major outlets of record, peer-reviewed science, official/gov.
// - medium: solid regional / secondary outlets.
// - low:    consensus low-credibility outlets (state propaganda, conspiracy sites) and raw
//           user-generated platforms (social networks, video, messaging) — a link to the
//           platform is not itself a verified source.

const HIGH: string[] = [
  // International wires / agencies
  "reuters.com",
  "apnews.com",
  "afp.com",
  "bloomberg.com",
  "efe.com",
  // Major outlets of record (EN)
  "bbc.com",
  "bbc.co.uk",
  "nytimes.com",
  "washingtonpost.com",
  "theguardian.com",
  "wsj.com",
  "ft.com",
  "economist.com",
  "npr.org",
  "pbs.org",
  "cnn.com",
  "nbcnews.com",
  "abcnews.go.com",
  "cbsnews.com",
  "abc.net.au",
  "politico.com",
  "axios.com",
  "time.com",
  "latimes.com",
  "aljazeera.com",
  "dw.com",
  "france24.com",
  "euronews.com",
  // Reference / peer-reviewed science / health authorities
  "wikipedia.org",
  "nature.com",
  "science.org",
  "sciencemag.org",
  "nejm.org",
  "thelancet.com",
  "who.int",
  "un.org",
  "europa.eu",
  // Major outlets — Spanish / Latin America
  "elpais.com",
  "elmundo.es",
  "infobae.com",
  "clarin.com",
  "lanacion.com.ar",
  "eluniversal.com.mx",
  "milenio.com",
  "proceso.com.mx",
  "animalpolitico.com",
  // Major outlets — Portuguese / Brazil
  "folha.uol.com.br",
  "globo.com",
  "estadao.com.br",
  "agenciabrasil.ebc.com.br",
];

const MEDIUM: string[] = [
  "newsweek.com",
  "businessinsider.com",
  "thehill.com",
  "vox.com",
  "huffpost.com",
  "usatoday.com",
  "theatlantic.com",
  "forbes.com", // mixes staff reporting with contributor blogs — secondary, not top-tier
];

const LOW: string[] = [
  // Consensus low-credibility outlets (state propaganda, conspiracy / pseudo-science)
  "rt.com",
  "sputniknews.com",
  "sputnikglobe.com",
  "breitbart.com",
  "infowars.com",
  "naturalnews.com",
  "zerohedge.com",
  "theepochtimes.com",
  "dailymail.co.uk",
  // Raw user-generated / platform links — not a verified source on their own
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "tiktok.com",
  "youtube.com",
  "reddit.com",
  "t.me",
  "medium.com",
];

export const DOMAIN_CREDIBILITY: Record<string, Reliability> = {
  ...Object.fromEntries(HIGH.map((d) => [d, "high" as Reliability])),
  ...Object.fromEntries(MEDIUM.map((d) => [d, "medium" as Reliability])),
  ...Object.fromEntries(LOW.map((d) => [d, "low" as Reliability])),
};

// Government / military / inter-governmental domains are authoritative for their own statements.
// Covers flat TLDs (.gov, .mil, .int) and the localised second-levels (.gov.uk, .gob.mx,
// .gouv.fr, .gov.br, …) used outside the US.
const GOV_TLD = /(?:^|\.)(?:gov|gob|gouv|mil)(?:\.[a-z]{2,3})?$/;

/**
 * The curated credibility of a domain, or undefined when we have no static rating (caller falls
 * back to the model). Case-insensitive; strips a leading `www.`; matches the registrable domain
 * so subdomains resolve too (`mundo.bbc.com` → bbc.com, `en.wikipedia.org` → wikipedia.org).
 */
export function domainCredibility(domain: string): Reliability | undefined {
  const d = domain.toLowerCase().replace(/^www\./, "");
  for (const known of Object.keys(DOMAIN_CREDIBILITY)) {
    if (d === known || d.endsWith(`.${known}`)) return DOMAIN_CREDIBILITY[known];
  }
  if (GOV_TLD.test(d)) return "high";
  return undefined;
}
