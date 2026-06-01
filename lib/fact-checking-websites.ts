// Is a given website a dedicated fact-checking outlet?
//
// PROVENANCE:
// The roster below is derived from Wikipedia's "List of fact-checking websites"
// (https://en.wikipedia.org/wiki/List_of_fact-checking_websites). It was reconciled
// against the live page (the revision dated 23 May 2026) on 2026-06-01: every outlet on
// that page with an identifiable dedicated domain was folded in, and the page's regional
// groupings are mirrored here. A handful of well-known outlets that were in our earlier
// best-effort snapshot but are not (or no longer) on the current Wikipedia list are kept
// — they remain real fact-checkers — so this set is a superset of that page, not a
// verbatim mirror. Wikipedia's list changes as outlets launch and shut down, so re-check
// periodically.
//
// Deliberately EXCLUDED:
//  - The page's "Fraudulent fact-checking websites" section (e.g. War on Fakes, GFCN,
//    Fact Checking Turkey) — these are propaganda outlets masquerading as fact-checkers.
//  - General-news domains whose fact-check work lives on a subpath (Reuters, BBC, Le
//    Monde / Les Décodeurs, The Washington Post, Deutsche Welle, India Today, The Quint,
//    NPR, RealClearPolitics, …) — we don't want to flag an entire news site as "a
//    fact-checker". Their dedicated-domain siblings (e.g. AFP's factcheck.afp.com) ARE
//    listed.
//  - Defunct/suspended services with no live domain (Hoax Slayer, GoHoo, Fact Check Net).
//
// This is broader than lib/exa.ts's FACT_CHECKERS (the small curated set used for the
// de-novo retrieval exclusion / grading answer key). This file answers the general
// question "is this domain a fact-checker?" for tagging, filtering, or analytics —
// independent of the pipeline's exclusion policy.

/** One fact-checking outlet: its name, primary web domain, and the region it operates in. */
export interface FactCheckingWebsite {
  name: string;
  /** Bare registrable domain (no scheme, no leading www), as we match it. */
  domain: string;
  region: string;
}

// Organized by the Wikipedia page's regional groupings. Domains are the dedicated
// fact-check domain where one exists; broad general-news domains (whose fact-check desks
// live on a subpath, e.g. major wires) are intentionally omitted to avoid flagging an
// entire news site as "a fact-checker".
export const FACT_CHECKING_WEBSITES: FactCheckingWebsite[] = [
  // International / multi-region
  { name: "Snopes", domain: "snopes.com", region: "International" },
  { name: "FactCheck.org", domain: "factcheck.org", region: "International" },
  { name: "PolitiFact", domain: "politifact.com", region: "International" },
  { name: "AFP Fact Check", domain: "factcheck.afp.com", region: "International" },
  { name: "Full Fact", domain: "fullfact.org", region: "Europe (UK)" },
  { name: "Lead Stories", domain: "leadstories.com", region: "International" },
  { name: "Truth or Fiction", domain: "truthorfiction.com", region: "North America" },
  { name: "Check Your Fact", domain: "checkyourfact.com", region: "North America" },
  { name: "Media Bias/Fact Check", domain: "mediabiasfactcheck.com", region: "North America" },
  { name: "Metabunk", domain: "metabunk.org", region: "North America" },
  { name: "VietFactCheck", domain: "vietfactcheck.org", region: "North America" },
  { name: "Science Feedback", domain: "sciencefeedback.co", region: "International" },
  { name: "Health Feedback", domain: "healthfeedback.org", region: "International" },
  { name: "Climate Feedback", domain: "climatefeedback.org", region: "International" },
  { name: "Logically Facts", domain: "logicallyfacts.com", region: "International" },
  { name: "FactCheckNI", domain: "factcheckni.org", region: "Europe (UK)" },

  // Africa
  { name: "Africa Check", domain: "africacheck.org", region: "Africa" },
  { name: "PesaCheck", domain: "pesacheck.org", region: "Africa (East)" },
  { name: "Dubawa", domain: "dubawa.org", region: "Africa (West)" },
  { name: "Roundcheck", domain: "roundcheck.com.ng", region: "Africa (Nigeria)" },
  { name: "News Verifier Africa", domain: "newsverifierafrica.com", region: "Africa" },
  { name: "FactCheckHub", domain: "factcheckhub.com", region: "Africa (Nigeria)" },
  { name: "Fact-Check Ghana", domain: "fact-checkghana.com", region: "Africa (Ghana)" },
  { name: "FactSpace West Africa", domain: "factspace.org", region: "Africa (West)" },
  { name: "GhanaFact", domain: "ghanafact.com", region: "Africa (Ghana)" },
  { name: "ZimFact", domain: "zimfact.org", region: "Africa (Zimbabwe)" },
  { name: "211 Check", domain: "211check.org", region: "Africa (South Sudan)" },

  // Asia-Pacific
  { name: "Alt News", domain: "altnews.in", region: "Asia (India)" },
  { name: "BOOM", domain: "boomlive.in", region: "Asia (India)" },
  { name: "Factly", domain: "factly.in", region: "Asia (India)" },
  { name: "Vishvas News", domain: "vishvasnews.com", region: "Asia (India)" },
  { name: "Newschecker", domain: "newschecker.in", region: "Asia (India)" },
  { name: "FactChecker.in", domain: "factchecker.in", region: "Asia (India)" },
  { name: "THIP Media", domain: "thip.media", region: "Asia (India)" },
  { name: "DFRAC", domain: "dfrac.org", region: "Asia (India)" },
  { name: "Telugupost", domain: "telugupost.com", region: "Asia (India)" },
  { name: "YouTurn", domain: "youturn.in", region: "Asia (India)" },
  { name: "Medical Dialogues", domain: "medicaldialogues.in", region: "Asia (India)" },
  { name: "NewsMobile", domain: "newsmobile.in", region: "Asia (India)" },
  { name: "Fact Crescendo", domain: "factcrescendo.com", region: "Asia (South Asia)" },
  { name: "Rappler", domain: "rappler.com", region: "Asia (Philippines)" },
  { name: "VERA Files", domain: "verafiles.org", region: "Asia (Philippines)" },
  { name: "Tsek.ph", domain: "tsek.ph", region: "Asia (Philippines)" },
  { name: "PressOne.PH", domain: "pressone.ph", region: "Asia (Philippines)" },
  { name: "Taiwan FactCheck Center", domain: "tfc-taiwan.org.tw", region: "Asia (Taiwan)" },
  { name: "MyGoPen", domain: "mygopen.com", region: "Asia (Taiwan)" },
  { name: "Cofacts", domain: "cofacts.tw", region: "Asia (Taiwan)" },
  { name: "China Fact Check", domain: "chinafactcheck.com", region: "Asia (China)" },
  { name: "Factcheck Lab", domain: "factchecklab.org", region: "Asia (Hong Kong)" },
  { name: "HKBU Fact Check", domain: "factcheck.hkbu.edu.hk", region: "Asia (Hong Kong)" },
  { name: "Annie Lab", domain: "annielab.org", region: "Asia (Hong Kong)" },
  { name: "Mafindo / TurnBackHoax", domain: "turnbackhoax.id", region: "Asia (Indonesia)" },
  { name: "Cek Fakta", domain: "cekfakta.com", region: "Asia (Indonesia)" },
  { name: "Rumor Scanner", domain: "rumorscanner.com", region: "Asia (Bangladesh)" },
  { name: "FactWatch", domain: "fact-watch.org", region: "Asia (Bangladesh)" },
  { name: "Jachai", domain: "jachai.org", region: "Asia (Bangladesh)" },
  { name: "Dismislab", domain: "dismislab.com", region: "Asia (Bangladesh)" },
  { name: "Nepal Fact Check", domain: "nepalfactcheck.org", region: "Asia (Nepal)" },
  { name: "Soch Fact Check", domain: "sochfactcheck.com", region: "Asia (Pakistan)" },
  { name: "FactCheck.lk", domain: "factcheck.lk", region: "Asia (Sri Lanka)" },
  { name: "SNU FactCheck", domain: "factcheck.snu.ac.kr", region: "Asia (South Korea)" },

  // Europe
  { name: "Maldita.es", domain: "maldita.es", region: "Europe (Spain)" },
  { name: "Newtral", domain: "newtral.es", region: "Europe (Spain)" },
  { name: "Verificat", domain: "verificat.cat", region: "Europe (Spain)" },
  { name: "Miniver", domain: "miniver.org", region: "Europe (Spain)" },
  { name: "Correctiv", domain: "correctiv.org", region: "Europe (Germany)" },
  { name: "dpa Faktencheck", domain: "dpa-factchecking.com", region: "Europe (Germany)" },
  { name: "Volksverpetzer", domain: "volksverpetzer.de", region: "Europe (Germany)" },
  { name: "Mimikama", domain: "mimikama.org", region: "Europe (Austria)" },
  { name: "Pagella Politica", domain: "pagellapolitica.it", region: "Europe (Italy)" },
  { name: "Facta", domain: "facta.news", region: "Europe (Italy)" },
  { name: "Bufale.net", domain: "bufale.net", region: "Europe (Italy)" },
  { name: "Butac", domain: "butac.it", region: "Europe (Italy)" },
  { name: "Captain Fact", domain: "captainfact.io", region: "Europe (France)" },
  { name: "HoaxBuster", domain: "hoaxbuster.com", region: "Europe (France)" },
  { name: "Demagog (Poland)", domain: "demagog.org.pl", region: "Europe (Poland)" },
  { name: "Pravda", domain: "pravda.org.pl", region: "Europe (Poland)" },
  { name: "FakeNews.pl", domain: "fakenews.pl", region: "Europe (Poland)" },
  { name: "Demagog (Czech)", domain: "demagog.cz", region: "Europe (Czechia)" },
  { name: "Demagog (Slovakia)", domain: "demagog.sk", region: "Europe (Slovakia)" },
  { name: "Faktograf", domain: "faktograf.hr", region: "Europe (Croatia)" },
  { name: "Raskrinkavanje", domain: "raskrinkavanje.ba", region: "Europe (Bosnia)" },
  { name: "Istinomer", domain: "istinomer.rs", region: "Europe (Serbia)" },
  { name: "Faktisk", domain: "faktisk.no", region: "Europe (Norway)" },
  { name: "TjekDet", domain: "tjekdet.dk", region: "Europe (Denmark)" },
  { name: "Faktabaari", domain: "faktabaari.fi", region: "Europe (Finland)" },
  { name: "Källkritikbyrån", domain: "kallkritikbyran.se", region: "Europe (Sweden)" },
  { name: "Polígrafo", domain: "poligrafo.sapo.pt", region: "Europe (Portugal)" },
  { name: "StopFake", domain: "stopfake.org", region: "Europe (Ukraine)" },
  { name: "VoxCheck", domain: "voxukraine.org", region: "Europe (Ukraine)" },
  { name: "Teyit", domain: "teyit.org", region: "Europe (Turkey)" },
  { name: "Doğruluk Payı", domain: "dogrulukpayi.com", region: "Europe (Turkey)" },
  { name: "Malumat Furuş", domain: "malumatfurus.org", region: "Europe (Turkey)" },
  { name: "Ellinika Hoaxes", domain: "ellinikahoaxes.gr", region: "Europe (Greece)" },
  { name: "FactReview", domain: "factreview.gr", region: "Europe (Greece)" },
  { name: "Check4facts", domain: "check4facts.gr", region: "Europe (Greece)" },
  { name: "FactCheck Georgia", domain: "factcheck.ge", region: "Europe (Georgia)" },
  { name: "Factcheck.bg", domain: "factcheck.bg", region: "Europe (Bulgaria)" },
  { name: "Factual.ro", domain: "factual.ro", region: "Europe (Romania)" },
  { name: "Re:Check (Re:Baltica)", domain: "rebaltica.lv", region: "Europe (Latvia)" },
  { name: "Debunk.org", domain: "debunk.org", region: "Europe (Lithuania)" },
  { name: "Nieuwscheckers", domain: "nieuwscheckers.nl", region: "Europe (Netherlands)" },
  { name: "Bellingcat", domain: "bellingcat.com", region: "Europe (Netherlands)" },
  { name: "Provereno.Media", domain: "provereno.media", region: "Europe (Estonia/Russia)" },
  { name: "Ferret Fact Service", domain: "theferret.scot", region: "Europe (UK)" },

  // Middle East
  { name: "Fatabyyano", domain: "fatabyyano.net", region: "Middle East (Jordan)" },
  { name: "Misbar", domain: "misbar.com", region: "Middle East" },
  { name: "Factnameh", domain: "factnameh.com", region: "Middle East (Iran)" },
  { name: "FakeReporter", domain: "fakereporter.net", region: "Middle East (Israel)" },
  { name: "Sawab", domain: "sawablb.com", region: "Middle East (Lebanon)" },

  // North America
  { name: "FactsCan", domain: "factscan.ca", region: "North America (Canada)" },

  // Oceania
  { name: "AAP FactCheck", domain: "aap.com.au", region: "Oceania (Australia)" },

  // Latin America
  { name: "Chequeado", domain: "chequeado.com", region: "South America (Argentina)" },
  { name: "Reverso", domain: "reversoar.com", region: "South America (Argentina)" },
  { name: "Aos Fatos", domain: "aosfatos.org", region: "South America (Brazil)" },
  { name: "Agência Lupa", domain: "lupa.uol.com.br", region: "South America (Brazil)" },
  { name: "Comprova", domain: "projetocomprova.com.br", region: "South America (Brazil)" },
  { name: "E-farsas", domain: "e-farsas.com", region: "South America (Brazil)" },
  { name: "Boatos.org", domain: "boatos.org", region: "South America (Brazil)" },
  { name: "AletheiaFact", domain: "aletheiafact.org", region: "South America (Brazil)" },
  { name: "Colombiacheck", domain: "colombiacheck.com", region: "South America (Colombia)" },
  { name: "Ecuador Chequea", domain: "ecuadorchequea.com", region: "South America (Ecuador)" },
  { name: "Bolivia Verifica", domain: "boliviaverifica.bo", region: "South America (Bolivia)" },
  { name: "Cotejo.info", domain: "cotejo.info", region: "South America (Venezuela)" },
  { name: "Mala Espina", domain: "malaespina.cl", region: "South America (Chile)" },
  { name: "Fast Check CL", domain: "fastcheck.cl", region: "South America (Chile)" },
  { name: "Ojo Público", domain: "ojo-publico.com", region: "South America (Peru)" },
  { name: "Salud con Lupa", domain: "saludconlupa.com", region: "South America (Peru)" },
  { name: "Verificado", domain: "verificado.mx", region: "South America (Mexico)" },
  { name: "UYcheck", domain: "uycheck.com", region: "South America (Uruguay)" },
];

/** Fast-membership set of every domain above, lowercased. */
const FACT_CHECKING_DOMAINS: ReadonlySet<string> = new Set(
  FACT_CHECKING_WEBSITES.map((w) => w.domain.toLowerCase()),
);

/** Reduce a URL or raw host to its bare lowercase hostname (no scheme, no leading www). */
function hostnameOf(input: string): string {
  const raw = input.trim().toLowerCase();
  if (!raw) return "";
  try {
    const withScheme = /^[a-z]+:\/\//.test(raw) ? raw : `https://${raw}`;
    return new URL(withScheme).hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^www\./, "").split("/")[0];
  }
}

/**
 * Whether a URL or domain belongs to a known fact-checking website. Accepts a full URL
 * ("https://www.snopes.com/fact-check/x") or a bare host ("snopes.com"), and matches
 * subdomains (a hit on "snopes.com" also matches "api.snopes.com"). Unknown ⇒ false.
 */
export function isFactCheckingWebsite(input: string): boolean {
  const host = hostnameOf(input);
  if (!host) return false;
  if (FACT_CHECKING_DOMAINS.has(host)) return true;
  // Subdomain match: any registered fact-check domain that `host` ends with.
  return [...FACT_CHECKING_DOMAINS].some((d) => host.endsWith(`.${d}`));
}
