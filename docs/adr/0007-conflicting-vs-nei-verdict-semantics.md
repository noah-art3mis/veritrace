# Conflicting-vs-NEI verdict semantics

**Status:** accepted

## Context

`sourceVerdict`/`claimVerdict` (`lib/pipeline/verdict.ts`) collapsed two situations AVeriTeC keeps distinct, and let a single decomposed sub-claim dominate a document (issue #53, from an eval-harness diagnosis):

- **Genuinely-unsettled claims (gold NEI) became `conflicting`.** A single atomic claim with high-reliability sources on _both_ sides — ivermectin-as-COVID-treatment (Oct 2020), barriers-reduce-border-crossings — was predicted `conflicting`. The old `claimVerdict` mapped "any deciding support AND any deciding refute" → `conflicting`. But for one atomic proposition, sources pulling both ways means the evidence does **not conclusively decide it** — which is exactly AVeriTeC's NEI, not cherrypicking.
- **One sub-claim dominated a compound.** A stray low-relevance resolved claim could flip the whole document: a minor `refuted` premise riding under a load-bearing `supported` claim made the document `conflicting` (or `refuted`), even though the source's central assertion was settled.

The root confusion: `conflicting` was being used for two unrelated things — "this one claim's evidence is mixed" and "this source mixes true and false claims." Only the second is cherrypicking.

## Decision

**`conflicting` is a document-level property — cherrypicking across claims — never a property of a single atomic claim.**

1. **`claimVerdict`: mixed deciding evidence → NEI, not conflicting.** When a single claim has both supporting and refuting _deciding_ evidence (after the #51 primary-source gate), the evidence does not conclusively decide it, so it abstains to **NEI**. An atomic proposition is never `conflicting`.

2. **`sourceVerdict`: relevance-weighted cherrypicking rule.** Aggregate the resolved (non-NEI) claims weighted by their triage `relevanceScore`, so a stray low-relevance claim cannot flip the document:
   - `supportWeight` = Σ relevanceScore of `supported` claims; `refuteWeight` = Σ of `refuted`.
   - Both sides present **and** the smaller is at least `CONFLICT_RATIO` (0.5) of the larger → **`conflicting`** (the source is genuinely cherrypicking — both sides are load-bearing). This is the El Mencho hero case.
   - Both sides present but **lopsided** (the minority is below the ratio) → the **majority** side's verdict. A minor false premise under a settled central claim no longer flips the document.
   - One side only → that verdict. No resolved claims → **NEI**.

   `relevanceScore` defaults to 1 when absent (older claims), so the rule degrades to "any support + any refute → conflicting" — the previous behaviour — when no scores exist.

`CONFLICT_RATIO = 0.5` is the fixed, inspectable threshold this ADR pins. It is provisional: the smoke-set eval (which needs live model keys) should confirm ivermectin / border-barriers no longer predict `conflicting` and El Mencho still does; tune the ratio there if needed.

## Considered options

- **Keep claim-level `conflicting` but only when both sides have a primary source** — rejected. For a single atomic proposition, "strong sources both ways" is genuine inconclusiveness (the ivermectin case), which AVeriTeC labels NEI. Reserving `conflicting` for the multi-claim level is the cleaner, more honest split.
- **Unweighted document rule (any supported + any refuted → conflicting)** — rejected: it is exactly what let a lone low-relevance claim dominate. Relevance weighting is the minimal fix.
- **Majority-vote document verdict** — rejected: it would erase the cherrypicking signal that is VERITRACE's most interesting output (a source that is half-true).

## Consequences

- A single claim can no longer be `conflicting`; `claimVerdict` returns NEI for mixed evidence. The `Verdict` union keeps `conflicting` because the **source** can still be conflicting, and `rationaleFor`'s conflicting branch remains as defensive coverage of the union.
- `sourceVerdict` now takes per-claim `{ verdict, relevanceScore }` instead of a bare `Verdict[]`; `stream.ts` passes the checked claims' scores. `tallyClaims` is unchanged (it still counts per-claim verdicts; the per-claim `conflicting` count will now be 0).
- **Lopsided decomposition that _drops_ a sub-claim** (e.g. flu-deaths keeping only "75,000 in 2019") is a decomposition-completeness problem in triage, not aggregation — this ADR makes aggregation correct _given_ the sub-claims, and the dropped-half case is tracked with the triage work (#52). Noted so it isn't mistaken for a hole in this rule.
