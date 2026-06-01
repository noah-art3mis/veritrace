import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Methodology & References — VERITRACE",
  description:
    "How VERITRACE works and the research it is grounded in: document-first claim decomposition, primary-source evidence retrieval, the AVeriTeC four-way verdict taxonomy, and process-based explainability.",
};

const PIPELINE: { n: string; title: string; body: string; color: string }[] = [
  {
    n: "01",
    title: "Segment",
    body: "The pasted source text is split into the complete set of atomic utterances it asserts or presupposes — granular and exhaustive, breaking apart lists and surfacing the background a reader takes for granted (“Springfield is a city”, “immigrants arrived”). This is the document-first tradition (SAFE / FacTool / Loki): the pipeline extracts the units rather than receiving a pre-isolated claim.",
    color: "#97a2b4",
  },
  {
    n: "02",
    title: "Decontextualize & triage",
    body: "Each utterance is rewritten to stand alone — date, place, and actor injected, so “they seized the airport” becomes a searchable assertion (the target is “molecular facts”; over-atomization that strips context is the known failure mode). A relevance filter then keeps only the load-bearing, contested claims for checking; trivial background and presuppositions are shown but dropped — SAFE’s separate relevance step.",
    color: "#97a2b4",
  },
  {
    n: "03",
    title: "Question",
    body: "For each claim the system generates the specific questions a professional fact-checker would ask. The question→answer pair is the unit of explanation, following AVeriTeC — the machine’s reasoning made observable.",
    color: "#3ad6e6",
  },
  {
    n: "04",
    title: "Retrieve",
    body: "Each question drives a live web search expanded with stance-shaped HyDE — the model writes hypothetical confirming and refuting primary-source passages and searches both directions, VERITRACE’s twist on the single neutral HyDE passage. An agent then traces every claim back to its originating source — news wires, official statements, registries — rather than stopping at re-reporting that echoes the viral claim. The verdict is built from that primary evidence: a finished third-party fact-check is treated as a lead to its underlying sources, not as the answer to copy.",
    color: "#34d399",
  },
  {
    n: "05",
    title: "Verify & explain",
    body: "Each source is classified for stance, reliability, and source type; a deterministic, stated rule aggregates evidence into an advisory verdict. The whole evidence graph — not a post-hoc paragraph — is the explanation. The journalist makes the final call.",
    color: "#f5b94a",
  },
];

const VERDICTS: { label: string; color: string; body: string }[] = [
  { label: "Supported", color: "#34d399", body: "Primary evidence corroborates the claim." },
  {
    label: "Refuted",
    color: "#fb7185",
    body: "Primary evidence contradicts it — including an official denial.",
  },
  {
    label: "Conflicting",
    color: "#f5b94a",
    body: "Sources both support and refute, or evidence is cherry-picked.",
  },
  {
    label: "Not Enough Evidence",
    color: "#8a94a6",
    body: "No usable primary evidence — uncertainty stated, not guessed.",
  },
];

interface Ref {
  key: string;
  title: string;
  detail: string;
  href?: string;
  hrefLabel?: string;
}

const REFERENCES: Ref[] = [
  {
    key: "warren",
    title: "Show Me the Work — Warren, Shklovski & Augenstein, 2025",
    detail:
      "Interviews with professional fact-checkers on what they need from automated fact-checking: not a verdict label but transparency and replicability into how a system reached its conclusion. The user requirement VERITRACE is built around — explainability as the inspectable process, not a post-hoc justification.",
    href: "https://doi.org/10.1145/3706598.3713277",
    hrefLabel: "doi:10.1145/3706598.3713277",
  },
  {
    key: "AVeriTeC",
    title: "AVeriTeC — Schlichtkrull et al., 2023",
    detail:
      "A dataset for real-world claim verification with evidence from the web: 4,568 real claims, four-way labels, and question–answer evidence trails as the explanation. The backbone VERITRACE’s schema follows.",
    href: "https://arxiv.org/abs/2305.13117",
    hrefLabel: "arXiv:2305.13117",
  },
  {
    key: "AVeriTeC-ST",
    title: "The AVeriTeC Shared Task, 2024",
    detail:
      "Open-web verification under compute and time limits; introduced the LLM-graded Ev2R metric. Establishes that these systems are research baselines, not turnkey production fact-checkers.",
    href: "https://arxiv.org/abs/2410.23850",
    hrefLabel: "arXiv:2410.23850",
  },
  {
    key: "FEVER",
    title: "FEVER — Thorne et al., 2018",
    detail:
      "Fact Extraction and VERification: 185k claims written against Wikipedia. Founded the retrieve → select → entail pipeline the field has since moved open-web.",
    href: "https://fever.ai/",
    hrefLabel: "fever.ai",
  },
  {
    key: "SAFE",
    title: "Long-form factuality (SAFE) — Google DeepMind, 2024",
    detail:
      "Break a long response into atomic facts, revise each to be self-contained, then search-and-judge. The canonical document-first atomic-fact verifier; VERITRACE’s extract+decontextualize stage is in this lineage.",
    href: "https://arxiv.org/abs/2403.18802",
    hrefLabel: "arXiv:2403.18802",
  },
  {
    key: "HerO",
    title: "HerO / HerO 2 — open-weights AVeriTeC pipeline",
    detail:
      "Competition-grade open-web pipeline (decompose → retrieve → verify) that operationalized the shared spine for the open web.",
    href: "https://github.com/ssu-humane/HerO",
    hrefLabel: "github.com/ssu-humane/HerO",
  },
  {
    key: "open",
    title: "FacTool · Loki / OpenFactVerification · FActScore",
    detail:
      "The open document-first verification lineage (GAIR-NLP; Libr-AI; FActScore seeded SAFE’s atomic decomposition). Confirms paste-a-document → decompose → web-verify as a validated pattern, not an invention.",
    href: "https://github.com/GAIR-NLP/factool",
    hrefLabel: "github.com/GAIR-NLP/factool",
  },
  {
    key: "kim",
    title: "Faithful explanations for fact-checking — Kim et al., 2024",
    detail:
      "Zero-shot LLM fact-check explanations are frequently unfaithful — plausible but not reflecting the actual reasoning. The core reason VERITRACE shows an evidence trail instead of asking you to trust a generated justification.",
    href: "https://arxiv.org/abs/2402.07401",
    hrefLabel: "arXiv:2402.07401",
  },
  {
    key: "jacovi",
    title: "Faithful vs plausible — Jacovi & Goldberg, 2020",
    detail:
      "An explanation can be plausible (convincing) yet unfaithful (not reflecting the actual reasoning) — dangerous for trust. VERITRACE favors faithful-by-construction process over post-hoc rationalization.",
    href: "https://aclanthology.org/2020.acl-main.386/",
    hrefLabel: "ACL 2020",
  },
  {
    key: "atanasova",
    title: "Generating fact-checking explanations — Atanasova et al., 2020",
    detail:
      "Joint veracity prediction and explanation generation; foundational explainable-FC work (CopeNLU).",
    href: "https://aclanthology.org/2020.acl-main.656/",
    hrefLabel: "ACL 2020",
  },
  {
    key: "clue",
    title: "CLUE — Sun et al., 2025 (CopeNLU)",
    detail:
      "Reframes uncertainty as something to explain — separating “conflicting” from “insufficient” evidence — which motivates VERITRACE’s reliability-based, non-binary uncertainty.",
    href: "https://arxiv.org/abs/2505.17855",
    hrefLabel: "arXiv:2505.17855",
  },
];

interface Inspiration {
  name: string;
  href?: string;
  body: string;
}

const INSPIRATIONS: { group: string; blurb: string; items: Inspiration[] }[] = [
  {
    group: "AI-text detection",
    blurb:
      "Tools that score whether prose was machine-generated. VERITRACE borrows their adversarial honesty — surface the signal, let the human judge — but checks claims against evidence rather than scoring style.",
    items: [
      {
        name: "GPTZero",
        href: "https://gptzero.me/",
        body: "Sentence-level AI-text detection for educators and publishers.",
      },
      {
        name: "Pangram",
        href: "https://www.pangram.com/",
        body: "High-precision AI-content detection with low false-positive rates.",
      },
      {
        name: "Originality.ai",
        href: "https://originality.ai/",
        body: "AI-detection plus plagiarism and fact-checking for content teams.",
      },
      {
        name: "SlopSpotter",
        body: "Community tooling for flagging low-quality, AI-generated “slop” on the web.",
      },
    ],
  },
  {
    group: "Research & scientific integrity",
    blurb:
      "Systems that police the scholarly and academic record. They share VERITRACE’s process-first stance: show the trail of why something is suspect, don’t just emit a score.",
    items: [
      {
        name: "Sleuth AI",
        href: "https://research-signals.com/2025/07/21/signals-launches-sleuth-ai/",
        body: "Signals’ agent for surfacing integrity problems in published research.",
      },
      {
        name: "Problematic Paper Screener",
        href: "https://dbrech.irit.fr/pls/apex/f?p=9999:1",
        body: "Scans the literature for tortured phrases and other fabrication tells.",
      },
      {
        name: "Turnitin",
        href: "https://www.turnitin.co.uk/",
        body: "Originality and AI-writing checks across student and academic work.",
      },
      {
        name: "COSIG",
        href: "https://cosig.net/",
        body: "Coalition for scientific-integrity tooling and shared detection resources.",
      },
    ],
  },
];

function Kicker({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-[var(--ink-3)]">
      {children}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-display text-[24px] font-semibold tracking-[-0.01em] text-[var(--ink-1)]">
      {children}
    </h2>
  );
}

export default function MethodologyPage() {
  return (
    <div className="flex flex-1 flex-col">
      <div
        className="h-[2px] w-full shrink-0"
        style={{
          background: "linear-gradient(90deg, transparent, var(--accent), transparent 70%)",
        }}
      />
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-[var(--line)] bg-[var(--bg-2)]/80 px-6 py-3 backdrop-blur">
        <Link href="/" className="flex items-baseline gap-3">
          <span className="font-display text-[22px] font-semibold leading-none tracking-[-0.02em] text-[var(--ink-1)]">
            Veri<span style={{ color: "var(--accent)" }}>trace</span>
          </span>
          <Kicker>Methodology &amp; References</Kicker>
        </Link>
        <Link
          href="/"
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-2)] transition-colors hover:text-[var(--accent)]"
        >
          ← Workbench
        </Link>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-14">
        {/* Hero */}
        <Kicker>How it works · what it&apos;s grounded in</Kicker>
        <h1 className="font-display mt-3 text-[44px] font-semibold leading-[1.05] tracking-[-0.02em] text-[var(--ink-1)]">
          Observable AI fact checker.
        </h1>
        <p className="mt-5 max-w-2xl text-[15px] leading-[1.7] text-[var(--ink-2)]">
          VERITRACE is an observability workbench for professional fact-checkers. It performs the
          full analysis automatically and renders it as a traversable evidence graph — so the
          machine&apos;s reasoning is granularly inspectable and the human keeps final judgment. The
          verdict is advisory; the evidence trail is the product.
        </p>

        {/* Pipeline */}
        <section className="mt-14">
          <SectionTitle>The pipeline</SectionTitle>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
            segment → decontextualize → triage → question → retrieve → verify → explain
          </p>
          <ol className="mt-6 flex flex-col gap-4">
            {PIPELINE.map((step) => (
              <li
                key={step.n}
                className="flex gap-4 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-5 py-4"
              >
                <span
                  className="font-mono text-[13px] font-semibold tabular-nums"
                  style={{ color: step.color }}
                >
                  {step.n}
                </span>
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--ink-1)]">{step.title}</h3>
                  <p className="mt-1.5 text-[13px] leading-[1.6] text-[var(--ink-2)]">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Primary-source bar */}
        <section className="mt-14">
          <SectionTitle>Tracing to primary sources — the honesty bar</SectionTitle>
          <p className="mt-4 text-[14px] leading-[1.7] text-[var(--ink-2)]">
            A retrieved link can play one of two roles.{" "}
            <span className="text-[var(--ink-1)]">Primary evidence</span> is a source the pipeline
            reasons over — a news-wire report, an official statement, a registry. A{" "}
            <span className="text-[var(--ink-1)]">finished third-party fact-check</span> is a
            different thing: useful as a pointer to the primary sources it cites, but its conclusion
            is never the answer we copy. The cheat we avoid is letting someone else&apos;s verdict
            stand in for our own. Fact-check outlets are currently allowed back into retrieval — so
            the agent can follow them through to the originating reports — but the verdict is always
            re-derived from the primary evidence the pipeline classifies for stance, reliability,
            and source type.{" "}
            <span className="text-[var(--ink-3)]">
              (A stricter mode that mechanically excludes those outlets from search is available and
              can be re-enabled.)
            </span>
          </p>
        </section>

        {/* Verdict taxonomy */}
        <section className="mt-14">
          <SectionTitle>Verdict taxonomy</SectionTitle>
          <p className="mt-4 text-[14px] leading-[1.7] text-[var(--ink-2)]">
            The field has abandoned binary true/false. VERITRACE uses AVeriTeC&apos;s four-way set,
            with uncertainty expressed as source-reliability and evidence-quality — not a bare
            confidence percentage.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {VERDICTS.map((v) => (
              <div
                key={v.label}
                className="rounded-lg border px-4 py-3"
                style={{ borderColor: `${v.color}3d`, background: `${v.color}0d` }}
              >
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: v.color }} />
                  <span className="font-display text-[14px] italic" style={{ color: v.color }}>
                    {v.label}
                  </span>
                </div>
                <p className="mt-1.5 text-[12.5px] leading-[1.55] text-[var(--ink-2)]">{v.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Scope */}
        <section className="mt-14">
          <SectionTitle>What this build can &amp; can&apos;t check</SectionTitle>
          <p className="mt-4 text-[14px] leading-[1.7] text-[var(--ink-2)]">
            A text-in, web-search build can honestly check{" "}
            <span className="text-[var(--ink-1)]">event/existence</span> and{" "}
            <span className="text-[var(--ink-1)]">official-denial</span> claims from primary
            sources. It <span className="text-[var(--ink-1)]">cannot</span> verify media-provenance,
            synthetic-media, or origin-trace claims — there are no pixels, no reverse-image or
            detector tooling — so those correctly resolve to{" "}
            <span style={{ color: "var(--nei)" }}>Not Enough Evidence</span>. That refusal to guess
            is the uncertainty-first principle working, not a failure.
          </p>
        </section>

        {/* Inspirations */}
        <section className="mt-14">
          <SectionTitle>Inspirations &amp; landscape</SectionTitle>
          <p className="mt-4 text-[14px] leading-[1.7] text-[var(--ink-2)]">
            VERITRACE sits next to a wider field of tools fighting fabrication — from AI-text
            detectors to research-integrity screeners. These shaped how we think about surfacing
            signal without forcing a verdict.
          </p>
          <div className="mt-6 flex flex-col gap-8">
            {INSPIRATIONS.map((g) => (
              <div key={g.group}>
                <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--ink-3)]">
                  {g.group}
                </h3>
                <p className="mt-2 text-[13px] leading-[1.6] text-[var(--ink-2)]">{g.blurb}</p>
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {g.items.map((it) => (
                    <li
                      key={it.name}
                      className="rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-3"
                    >
                      {it.href ? (
                        <a
                          href={it.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-display text-[14px] font-semibold transition-colors hover:underline"
                          style={{ color: "var(--accent)" }}
                        >
                          {it.name} ↗
                        </a>
                      ) : (
                        <span className="font-display text-[14px] font-semibold text-[var(--ink-1)]">
                          {it.name}
                        </span>
                      )}
                      <p className="mt-1.5 text-[12.5px] leading-[1.55] text-[var(--ink-2)]">
                        {it.body}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* References */}
        <section className="mt-14">
          <SectionTitle>References</SectionTitle>
          <ul className="mt-6 flex flex-col divide-y divide-[var(--line)]">
            {REFERENCES.map((r) => (
              <li key={r.key} className="py-4">
                <h3 className="text-[13.5px] font-semibold text-[var(--ink-1)]">{r.title}</h3>
                <p className="mt-1.5 text-[12.5px] leading-[1.6] text-[var(--ink-2)]">{r.detail}</p>
                {r.href && (
                  <a
                    href={r.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-block font-mono text-[11px] tracking-wide transition-colors hover:underline"
                    style={{ color: "var(--accent)" }}
                  >
                    {r.hrefLabel ?? r.href} ↗
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>

        <footer className="mt-14 border-t border-[var(--line)] pt-6">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-[var(--ink-3)]">
            VERITRACE · evidence graph · primary-source-first · the verdict is advisory
          </p>
          <Link
            href="/"
            className="mt-3 inline-block font-mono text-[11px] uppercase tracking-[0.14em] transition-colors hover:underline"
            style={{ color: "var(--accent)" }}
          >
            ← Back to the workbench
          </Link>
        </footer>
      </main>
    </div>
  );
}
