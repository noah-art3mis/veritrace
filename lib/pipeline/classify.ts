import type { ReasoningProvider } from "../reasoner-types";
import type {
  ClaimItem,
  QuestionItem,
  EvidenceItem,
  Stance,
  Reliability,
  SourceType,
} from "../graph-types";
import type { RawEvidence } from "../exa";
import { domainCredibility } from "../domain-credibility";

const SYSTEM = `You are the evidence-classification stage of VERITRACE. Given a claim (with its event date), the question being resolved, and a set of retrieved sources (each with a publication date), classify EACH source relative to the CLAIM.

For each source decide:
- "stance": "supports" (the passage gives evidence the claim is true), "refutes" (evidence it is false — including an official denial of the claimed event), or "contextualizes" (relevant background that neither confirms nor denies).
- "reliability": "high" (news wire, major outlet, official government/agency statement, primary registry), "medium" (regional outlet, secondary reporting), "low" (blog, social aggregator, anonymous, content farm).
- "sourceType": "primary" (the ORIGINATING report, official statement/registry, or news wire reporting the event firsthand), "secondary" (re-reporting of a primary source — including a story ABOUT someone else's statement), "opinion" (op-ed / commentary). A FINISHED FACT-CHECK ARTICLE (one that adjudicates the viral claim — headlines like "É falso que…", "X is not…", "Fact check:…") is NEVER "primary"; classify it "secondary" (or "opinion"). Primary is reserved for the underlying source the event itself produced, not a third party's verdict on it.
- "stanceConfidence": 0.0–1.0, how clearly the passage takes that stance toward the claim.

Temporal logic — compare each source's publication date to the claim's event date before assigning a stance. For a claim that an event happened or a state changed at a point in time (a death, killing, seizure, attack, arrest, resignation, collapse), a source published BEFORE the event date CANNOT refute it: reporting the earlier state ("X was alive on the 18th", "the airport operated normally on the 20th") is fully consistent with the event occurring afterward — mark such a pre-event source "contextualizes", never "refutes". Only a source dated on or after the event that affirmatively says it did not happen (an official denial issued after the date, a "reports of X are false" once it would have occurred) is "refutes". This applies to event/state-change claims; for a standing fact with no single event date, judge stance normally. When a source's publication date is "unknown", judge on the passage alone.

Scope logic — match the claim's QUANTIFIER before assigning a stance. If the claim asserts a GROUP or collective acted ("protesters threatened officers", "officials lied", "residents fled"), a source documenting a SINGLE individual doing it does NOT "support" the collective claim — one person is not the group, so mark it "contextualizes" (it shows an instance, not that the group did it). Only a source indicating the group, multiple actors, or a coordinated/representative action "supports" a collective claim. Symmetrically, a claim about one named individual is not supported by a source only about a crowd. Over-generalizing a lone actor to a group is a common misinformation move — do not launder it into "supports".

Be skeptical: a passage that merely repeats the viral claim without verification is "contextualizes", not "supports". An authority's denial is "refutes" with high reliability.

Respond with ONLY a JSON array, one object per source IN THE SAME ORDER, no prose:
[{ "stance": "...", "reliability": "...", "sourceType": "...", "stanceConfidence": 0.0 }]`;

interface Classification {
  stance: Stance;
  reliability: Reliability;
  sourceType: SourceType;
  stanceConfidence: number;
}

// Reliability is load-bearing (only high/medium move a verdict — verdict.ts), so for domains
// we recognise we don't leave it to a per-call LLM guess: the static credibility list is
// authoritative and overrides the model's rating (up OR down). Unknown domains keep the model's
// judgement. See lib/domain-credibility.ts.
function staticReliability(domain: string, modelReliability: Reliability): Reliability {
  return domainCredibility(domain) ?? modelReliability;
}

export async function classifyEvidence(
  claim: ClaimItem,
  question: QuestionItem,
  raw: RawEvidence[],
  ask: ReasoningProvider,
): Promise<EvidenceItem[]> {
  if (raw.length === 0) return [];

  const sources = raw
    .map(
      (r, i) =>
        // Feed the fuller `text` (up to the run's read depth), not just the short card excerpt,
        // so stance is judged on as much of the document as was retrieved.
        `[${i}] domain: ${r.domain}\n    published: ${r.publishedDate ?? "unknown"}\n    title: ${r.title}\n    content: ${r.text || r.passage || "(no excerpt retrieved)"}`,
    )
    .join("\n\n");

  const classifications = await ask.askJSON<Classification[]>(
    `Claim: "${claim.text}"\nClaim event date: ${claim.date ?? "unspecified"}\nQuestion: "${question.text}"\n\nSources:\n${sources}\n\nClassify each source.`,
    // The gather loop can collect up to ~8 sources; at 800 tokens the pretty-printed
    // JSON array was being truncated mid-element, which then failed to parse. Size the
    // cap to comfortably hold one object per collected source.
    { system: SYSTEM, maxTokens: 2048 },
  );

  return raw.map((r, i) => {
    const c = classifications[i] ?? {
      stance: "contextualizes" as Stance,
      reliability: "low" as Reliability,
      sourceType: "secondary" as SourceType,
      stanceConfidence: 0.3,
    };
    return {
      id: `${question.id}-e${i + 1}`,
      questionId: question.id,
      title: r.title,
      url: r.url,
      domain: r.domain,
      faviconUrl: r.faviconUrl,
      publishedDate: r.publishedDate,
      passage: r.passage,
      stance: c.stance,
      reliability: staticReliability(r.domain, c.reliability),
      sourceType: c.sourceType,
      stanceConfidence: c.stanceConfidence,
    };
  });
}
