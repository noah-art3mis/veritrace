// Bootstrap golden eval examples from openly-available academic fact-checking corpora,
// emitting the GoldenClaim shape defined in ./schema.ts. Two importers:
//
//   AVeriTeC (NeurIPS'23, CC-BY-NC-4.0) — 4,568 real claims over ~50 orgs incl. Snopes &
//     Full Fact. Its 4 labels are IDENTICAL to ours, and its claim→Q/A→evidence structure
//     mirrors our graph. This is the primary source for English Snopes/Full Fact golds.
//   X-Fact (ACL'21, MIT) — 25 languages incl. Portuguese; the route to Aos Fatos / pt-BR.
//
// Dependency-free ESM: runs under plain `node`, no install, no tsx. The pure mapping
// functions are exported and unit-tested in ./convert.test.ts (run via `npm test`).
//
// Usage:
//   node evals/golden/convert.mjs averitec data/averitec_dev.json --split dev > out.jsonl
//   node evals/golden/convert.mjs averitec data/averitec_dev.json --site snopes.com > snopes.jsonl
//   node evals/golden/convert.mjs xfact    data/x-fact/dev.tsv    --lang pt --site aosfatos > aosfatos.jsonl
//
// Flags: --split eval|dev|smoke (default: eval) · --site <substr> (filter by org/host
//        substring) · --lang <iso2> (X-Fact only) · --out <file> (default: stdout).
// Records with no usable gold label (e.g. the unlabelled AVeriTeC test split) are skipped;
// counts are reported on stderr.

import { readFileSync, writeFileSync } from "node:fs";

// ---- Label normalisation ----------------------------------------------------------------

/** AVeriTeC's 4 labels → our Verdict enum. A 1:1 mapping — AVeriTeC is where ours came from. */
export const AVERITEC_LABELS = {
  Supported: "supported",
  Refuted: "refuted",
  "Conflicting Evidence/Cherrypicking": "conflicting",
  "Not Enough Evidence": "nei",
};

/** X-Fact's veracity labels (7-way, lowercased) → our Verdict enum. Lossy by design:
 *  half-true/misleading collapse to `conflicting`; unverifiable/other to `nei`. */
export const XFACT_LABELS = {
  true: "supported",
  "mostly true": "supported",
  false: "refuted",
  "mostly false": "refuted",
  "partly true/misleading": "conflicting",
  "half true": "conflicting",
  "complicated/hard to categorise": "nei",
  other: "nei",
  unverified: "nei",
};

// ---- Helpers ----------------------------------------------------------------------------

/** Peel a Wayback Machine wrapper off a URL. AVeriTeC's `fact_checking_article` is almost
 *  always a snapshot like `https://web.archive.org/web/<timestamp>/https://real.host/...`
 *  (the timestamp may carry a modifier suffix, e.g. `…id_`). Without peeling it, EVERY
 *  record's host is archive.org and org derivation / `--site` filtering break. Returns the
 *  inner URL when wrapped, otherwise the input unchanged. */
export function unwrapArchive(url) {
  const m = String(url || "").match(/^https?:\/\/web\.archive\.org\/web\/[^/]+\/(https?:\/\/.+)$/);
  return m ? m[1] : url || "";
}

/** Lowercase host of a URL, sans leading "www.". "" if unparseable. */
export function hostOf(url) {
  try {
    return new URL(url).host.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

/** Map a fact-check article host to a known org slug, else the bare host. */
export function orgFromHost(host) {
  if (!host) return "other";
  if (host.includes("snopes")) return "snopes";
  if (host.includes("fullfact")) return "fullfact";
  if (host.includes("aosfatos")) return "aosfatos";
  if (host.includes("politifact")) return "politifact";
  return host;
}

/** Best-effort normalise a date to ISO YYYY-MM-DD. Accepts ISO, dd-mm-yyyy, mm/dd/yyyy.
 *  Returns undefined if it can't parse confidently (we'd rather drop than guess wrong). */
export function toISODate(raw) {
  if (!raw || typeof raw !== "string") return undefined;
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/); // dd-mm-yyyy (AVeriTeC)
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // mm/dd/yyyy
  if (m) {
    const [, mo, d, y] = m;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return undefined;
}

function slug(s, max = 48) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max);
}

// ---- AVeriTeC importer ------------------------------------------------------------------

/**
 * Convert one AVeriTeC record into a GoldenClaim, or null if it has no usable label
 * (the test split ships unlabelled). `split` and a positional `index` seed the stable id.
 */
export function fromAveritec(rec, { split = "eval", index = 0 } = {}) {
  const verdict = AVERITEC_LABELS[rec.label];
  if (!verdict) return null; // unlabelled (test split) or unknown label → skip

  const articleUrl = unwrapArchive(rec.fact_checking_article || rec.original_claim_url || "");
  const org = orgFromHost(hostOf(articleUrl));

  const questions = Array.isArray(rec.questions)
    ? rec.questions
        .filter((q) => q && q.question)
        .map((q) => ({
          question: q.question,
          keyEvidenceUrls: dedupe((q.answers || []).map((a) => a && a.source_url).filter(Boolean)),
        }))
    : [];

  const keyEvidenceUrls = dedupe(questions.flatMap((q) => q.keyEvidenceUrls));

  return {
    id: `averitec-${split}-${String(index).padStart(5, "0")}`,
    claim: rec.claim,
    claimDate: toISODate(rec.claim_date),
    speaker: rec.speaker || undefined,
    gold: {
      verdict,
      justification: rec.justification || undefined,
      questions: questions.length ? questions : undefined,
      keyEvidenceUrls,
    },
    source: {
      org,
      url: articleUrl,
      originalRating: rec.label,
      language: "en", // AVeriTeC is English-only
      benchmark: "averitec",
    },
    license: "CC-BY-NC-4.0",
    split,
    tags: Array.isArray(rec.claim_types) ? rec.claim_types.map((t) => slug(t)) : [],
  };
}

// ---- X-Fact importer --------------------------------------------------------------------

/**
 * Convert one X-Fact TSV row (already split into `cols`, indexed against the header map
 * `idx`) into a GoldenClaim, or null if unlabelled/unmappable. X-Fact column names vary
 * slightly across releases, so we resolve by header NAME rather than fixed position.
 */
export function fromXfactRow(cols, idx, { split = "eval", index = 0 } = {}) {
  const get = (name) => (idx[name] != null ? (cols[idx[name]] || "").trim() : "");
  const rawLabel = get("label").toLowerCase();
  const verdict = XFACT_LABELS[rawLabel];
  if (!verdict || !get("claim")) return null;

  const language = get("language") || "";
  const site = get("site") || "";
  // Evidence columns are named evidence_1..evidence_n (or similar) — collect them all.
  const evidenceUrls = dedupe(
    Object.keys(idx)
      .filter((k) => /^evidence/i.test(k))
      .map((k) => cols[idx[k]])
      .filter(Boolean)
      .map((cell) => firstUrl(cell))
      .filter(Boolean),
  );

  return {
    id: `xfact-${language || "xx"}-${slug(orgFromHost(site) || "src", 16)}-${String(index).padStart(5, "0")}`,
    claim: get("claim"),
    claimDate: toISODate(get("claimDate") || get("claimdate")),
    speaker: get("claimant") || undefined,
    gold: {
      verdict,
      keyEvidenceUrls: evidenceUrls,
    },
    source: {
      org: orgFromHost(site),
      url: get("link") || get("claimURL") || site,
      originalRating: get("label"),
      language,
      benchmark: "x-fact",
    },
    license: "MIT",
    split,
    tags: [language ? `lang:${language}` : ""].filter(Boolean),
  };
}

// ---- small utils ------------------------------------------------------------------------

function dedupe(arr) {
  return [...new Set(arr)];
}

/** X-Fact evidence cells pack a search snippet; pull the first http(s) URL out of one. */
function firstUrl(cell) {
  const m = String(cell).match(/https?:\/\/[^\s"']+/);
  return m ? m[0] : "";
}

// ---- CLI --------------------------------------------------------------------------------

function parseArgs(argv) {
  const [, , source, file, ...rest] = argv;
  const opts = { source, file, split: "eval", site: "", lang: "", out: "" };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === "--split") opts.split = rest[++i];
    else if (a === "--site") opts.site = rest[++i];
    else if (a === "--lang") opts.lang = rest[++i];
    else if (a === "--out") opts.out = rest[++i];
  }
  return opts;
}

function convertAveritec(file, opts) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (!Array.isArray(data)) throw new Error("AVeriTeC file must be a JSON array");
  const out = [];
  let kept = 0;
  data.forEach((rec, i) => {
    const g = fromAveritec(rec, { split: opts.split, index: i });
    if (!g) return;
    if (
      opts.site &&
      !`${g.source.org} ${g.source.url}`.toLowerCase().includes(opts.site.toLowerCase())
    )
      return;
    out.push(g);
    kept++;
  });
  process.stderr.write(`averitec: ${kept}/${data.length} records kept\n`);
  return out;
}

function convertXfact(file, opts) {
  const lines = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.length);
  if (!lines.length) return [];
  const header = lines[0].split("\t");
  const idx = {};
  header.forEach((name, i) => (idx[name.trim()] = i));
  const out = [];
  let kept = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    const g = fromXfactRow(cols, idx, { split: opts.split, index: i });
    if (!g) continue;
    if (opts.lang && g.source.language.toLowerCase() !== opts.lang.toLowerCase()) continue;
    if (
      opts.site &&
      !`${g.source.org} ${g.source.url}`.toLowerCase().includes(opts.site.toLowerCase())
    )
      continue;
    out.push(g);
    kept++;
  }
  process.stderr.write(`x-fact: ${kept}/${lines.length - 1} rows kept\n`);
  return out;
}

function main() {
  const opts = parseArgs(process.argv);
  if (!opts.source || !opts.file || !["averitec", "xfact"].includes(opts.source)) {
    process.stderr.write(
      "usage: node evals/golden/convert.mjs <averitec|xfact> <file> [--split eval|dev|smoke] [--site <substr>] [--lang <iso2>] [--out <file>]\n",
    );
    process.exit(2);
  }
  const records =
    opts.source === "averitec" ? convertAveritec(opts.file, opts) : convertXfact(opts.file, opts);
  const jsonl = records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : "");
  if (opts.out) {
    writeFileSync(opts.out, jsonl);
    process.stderr.write(`wrote ${records.length} records → ${opts.out}\n`);
  } else {
    process.stdout.write(jsonl);
  }
}

// Only run the CLI when invoked directly, not when imported by the tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
