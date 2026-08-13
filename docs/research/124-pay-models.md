# Pay models of fact-checking & journalism software (#124)

Research for issue #124: who pays for software in this category, what each pay model has actually produced, and which model could plausibly sustain VERITRACE. Claims are cited to primary or first-party sources (organizations' own funding pages, first-party pricing pages, foundations' and projects' own announcements, and IFCN/Poynter's own reports).

## The macro picture first

The single most important fact about this market changed in January 2025: Meta announced the end of its third-party fact-checking program in the US and its move to Community Notes ([Meta, "More Speech and Fewer Mistakes", 7 Jan 2025](https://about.fb.com/news/2025/01/meta-more-speech-fewer-mistakes/); [Poynter's explainer](https://www.poynter.org/fact-checking/2025/meta-ends-fact-checking-community-notes-facebook/)). The IFCN's own survey of 141 organizations in 71 countries – the [State of the Fact-Checkers 2025 report](https://www.poynter.org/wp-content/uploads/2026/03/2026-State-of-Fact-Checkers-4.pdf) ([summary](https://www.poynter.org/ifcn/2026/state-fact-checkers-2025/)) – measures the aftermath: **76% of fact-checking organizations describe their finances as vulnerable or in crisis**, 45.3% saw revenue decline after the Meta and USAID withdrawals, financial sustainability is the top challenge for 89.1%, and **grants replaced Meta as the largest average revenue source at 46.2% of income**. Any pay model for VERITRACE has to be read against a customer base that is itself grant-funded and shrinking – and against the report's other finding, that audiences grew (62% of orgs) even as money fell. Demand for verification is not the constraint; monetizable demand is.

One structural fact about this customer base predates the 2025 shock and explains why the taxonomy below has to span such different buyers. Graves' mapping of the global fact-checking movement – Graves, L. (2018), "Boundaries Not Drawn: Mapping the institutional roots of the global fact-checking movement", Journalism Studies 19(5), [DOI 10.1080/1461670X.2016.1196602](https://doi.org/10.1080/1461670X.2016.1196602) – positions fact-checking organizations by their institutional ties to three parent fields, journalism, academia, and politics/civil society, plotting them on a ternary diagram and distinguishing a "newsroom model" from an "NGO model" of fact-checking. (**Cited from publisher metadata and abstract only – the full text is paywalled and was not read for this doc.**) At citation level it corroborates what the funding evidence below shows independently: there is no single "fact-checker customer" – the same product faces a newsroom buyer (models 1–4), an NGO/civil-society buyer (models 5–7), and an academic buyer (models 8–9), each with its own money source, and a pay model tuned to one corner of that triangle will miss the other two.

## Taxonomy of pay models, with evidence

### 1. Enterprise platform contracts (sell moderation/verification to Big Tech)

- **Who used it** – Logically (UK; TikTok and Meta moderation/fact-checking contracts); every IFCN signatory paid under Meta's third-party program.
- **Evidence** – Logically raised tens of millions, lost the TikTok and Meta contracts as platforms rolled back anti-misinformation programs, filed for administration, and had its assets sold in a **pre-pack administration deal in July 2025** to Kreatur, a vehicle of a former director ([Sifted](https://sifted.eu/articles/logically-ai-fact-check-misinformation-trump-tiktok-meta); [UKTN](https://www.uktech.news/ai/ai-fact-checker-logically-sold-off-in-administration-deal-20250707); [BusinessCloud](https://businesscloud.co.uk/news/rise-fall-of-yorkshire-firm-sold-in-pre-pack-administration-deal/)). On the buyer side, Meta's own announcement ended the program that paid the checkers ([Meta](https://about.fb.com/news/2025/01/meta-more-speech-fewer-mistakes/)); Full Fact's disclosed accounts show what a single such contract was worth – **£353,475 from Meta in 2024**, against total income of £2.9m ([Press Gazette, from Full Fact's accounts](https://pressgazette.co.uk/platforms/cost-cuts-and-new-donors-help-full-fact-weather-loss-of-1m-google-funding/)).
- **Durability** – the worst in the category. Revenue concentrated in one or two platform buyers whose demand proved discretionary and politically contingent; when the political weather turned in 2025, the contracts evaporated and took the largest vendor with them.

### 2. Enterprise licensing outside journalism (repositioning to comms/risk)

- **Who used it** – Dataminr (corporate risk and public sector alerting), NewsWhip (PR/comms analytics), Factmata (absorbed into Cision's media-monitoring stack). Originality.ai belongs partly here: a fact-checking-adjacent toolset that survives by selling AI-detection and plagiarism checks to content marketers and SEO agencies at **$14.95–179/mo** ([Originality.ai pricing](https://originality.ai/pricing)).
- **Evidence** – the technology survives; the newsroom stops being the customer. Originality.ai's price ladder (Pro $14.95/mo, Enterprise $179/mo, fact-checking bundled as one feature among AI/plagiarism/readability checks) shows what the adjacent content-marketing market will pay – an order of magnitude more seats than journalism offers.
- **Durability** – good, at the cost of the mission. The VERITRACE analogue would be selling claim-verification as brand-safety or comms tooling.

### 3. Data/ratings licensing (the proprietary-dataset model)

- **Who uses it** – NewsGuard: source-reliability ratings and misinformation "fingerprints" licensed to platforms, AI providers, advertisers, and research institutions via dashboard, API, or datastream; publishers are never charged to be rated ([NewsGuard solutions page](https://www.newsguardtech.com/solutions/newsguard/)). A consumer tier exists at **$4.95/mo** (£4.95 UK, €4.95 EU) after a free trial ([NewsGuard FAQ](https://www.newsguardtech.com/newsguard-faq/)).
- **Evidence** – alive and recurring because the asset is a continuously maintained, human-curated dataset that enterprises re-license every year – including, since the LLM era, AI companies buying anti-misinformation guardrails (its "FAILSafe for AI" product line).
- **Durability** – commercially solid, politically exposed (it has been a named target of US political pressure since 2025). The model only works if you own a dataset others must rent.

### 4. Cheap per-seat SaaS to individual professionals

- **Who uses it** – Factiverse (Norway): free tier plus **Pro at €25/mo** for professionals – claim detection, source discovery, API access ([Factiverse pricing](https://www.factiverse.ai/pricing)). NewsGuard's consumer tier ($4.95/mo) and Originality.ai's Pro tier ($14.95/mo) bracket it from below.
- **Evidence** – alive at small scale. €25/mo is the observed ceiling for a journalist seat; below it sit consumer-grade prices, above it only enterprise contracts. Everyone who survives in this cell sells mostly to adjacent buyers (content, comms, SEO) rather than to journalists alone, because the journalist-only TAM is tiny and the journalists themselves are grant-funded (see the macro picture).
- **Durability** – fragile as a sole model; works as a top-up layer. The unit economics constraint is hard: seat price must cover per-run LLM + search-API cost, which is exactly why VERITRACE's per-run cost display (#10/#62/#67) is strategically load-bearing, not a nicety.

### 5. Nonprofit + grants + open source

- **Who uses it** – Meedan (Check, open source): **$5.7M from the US National Science Foundation** for Co-Insights ([reported from the NSF grant](https://dailycaller.com/2024/02/05/federal-government-5-7-million-grant-nonprofit-misinformation-reporting-tool-private-messages-meedan/)), **$500k+ from the Patrick J. McGovern Foundation** ([Meedan's own announcement](https://meedan.org/post/patrick-j-mcgovern-foundation-pjmf-to-help-meedan-evolve-check)), and a **Press Forward** grant from the coalition committing $500M+ to local news ([Meedan's announcement](https://meedan.org/post/meedan-wins-press-forward-grant-to-pilot-new-software)). Full Fact (UK charity): total income **£2.9m in 2024, £3,054,478 in 2025**, from thousands of individual donors, charitable trusts (Mohn Westlake, Nuffield, Pears…), and tech platforms, with every donation above £25k disclosed and a stated no-editorial-input policy ([Full Fact's own funding page](https://fullfact.org/about/funding/)). Also Klaxon (Marshall Project) and the Internet Archive.
- **Evidence** – the most durable cluster in the landscape: nothing in it has died. But the stress test arrived in 2024–25: Full Fact lost **over £1m/year of Google-linked funding** (AI tooling £443,482 via Tides, research £154,070, social impact £111,725, structured data £92,478, elections £46,752 – all cut or not renewed) and survived through cost cuts and new donors ([Press Gazette](https://pressgazette.co.uk/platforms/cost-cuts-and-new-donors-help-full-fact-weather-loss-of-1m-google-funding/)). Grants are now 46.2% of the average fact-checker's income ([IFCN 2025](https://www.poynter.org/ifcn/2026/state-fact-checkers-2025/)) – the pool everyone is drinking from.
- **Durability** – strong but treadmill-shaped: sustainability equals grant renewal, and the 2025 US cuts (USAID, Google's retrenchment) shrank the pool exactly as demand for it grew.

### 6. Grant-seeded, network-shared (the LatAm model)

- **Who uses it** – Chequeado's **Chequeabot** (Argentina): built with grant/prize money, used free by **10+ fact-checking organizations** across Cuba, Venezuela, Chile, Colombia, and Bolivia, with the LatamChequea network (41 orgs) and Factchequeado (74 US media allies) as the distribution channel ([Chequeado's MIT Solve application](https://solve.mit.edu/challenges/2024-global-economic-prosperity-challenge/solutions/87157); [Poynter on Chequeabot](https://www.poynter.org/fact-checking/2018/in-argentina-fact-checkers%c2%92-latest-hire-is-a-bot/)). **Radar Aos Fatos** (Brazil): won the Google News Initiative Innovation Challenge 2019 (LatAm round funded projects up to $250k – [GNI](https://newsinitiative.withgoogle.com/resources/programs/innovation-challenges/), [Opportunity Desk](https://opportunitydesk.org/2019/06/18/google-news-initiative-innovation-challenge-2019-for-latin-america/)), built a real-time disinformation monitor, and sells institutional monitoring/reports on top ([Aos Fatos's own launch post](https://www.aosfatos.org/noticias/aos-fatos-launches-real-time-monitoring-system-against-misinformation/)).
- **Evidence** – every tool in this cell is alive. The pattern: one org builds with grant money, the network is the distribution, and an optional institutional-subscription layer (Radar's reports) sits on top for earned revenue. An academic study of the GNI LatAm challenges confirms the business-model shape and its path-dependence on Google money ([Journal of Media Business Studies](https://www.tandfonline.com/doi/full/10.1080/16522354.2024.2402630)).
- **Durability** – the best in class for tools, with one caveat: the seed money in the flagship case was Google's, and Google's journalism funding proved retractable (see Full Fact above). The network-shared structure, however, means no single contract's loss kills the tool.

### 7. Coalition / consortium funding

- **Who uses it** – **Comprova** (Brazil): a permanent collaborative verification program coordinated by Abraji, currently spanning dozens of newsrooms ([Abraji's project page](https://www.abraji.org.br/english/projects/comprova_project); [Comprova's about page](https://projetocomprova.com.br/about/) – which also records that Comprova used verdict labels only "until May 2025", i.e. it went label-free). Tools used inside coalitions (Comprova runs on tiplines/Check) are sustained by the coalition's funding, not their own revenue.
- **Evidence** – durable for processes; the coalition is the customer of record and foundations fund the coalition. Comprova has run continuously since 2018 across elections and pandemics.
- **Durability** – good, but it is an adoption channel more than a revenue model: one coalition deal delivers dozens of newsrooms at once.

### 8. State / institutional funding

- **Who uses it** – EU-funded verification tooling: the InVID (2016–18) → WeVerify (2018–21) → **vera.ai** lineage, the latter funded by **Horizon Europe Grant Agreement 101070093** plus Innovate UK grant 10039055 and the Swiss SERI ([CORDIS record](https://www.cordis.europa.eu/project/id/101070093); [vera.ai project summary](https://www.veraai.eu/project-summary)). In Brazil, the TSE's anti-disinformation program partners with academic monitors.
- **Evidence** – three consecutive EU projects kept the same verification plugin alive for a decade – successive-grant funding works when a funder has a standing policy interest. Geographically uneven: robust in the EU and Brazil, politically radioactive in the US since 2025 (the NSF/USAID-linked grants above became attack surface).
- **Durability** – stable where the political commitment exists; never portable, never a sole leg.

### 9. Free academic service (no revenue requirement)

- **Who uses it** – **ClaimBuster** (UT Arlington, IDIR lab): end-to-end claim-spotting released 2017, NSF-funded, with a public API called hundreds of thousands of times by external users such as the Duke Reporters' Lab ([UTA's own announcement](https://www.uta.edu/news/news-releases/2017/08/24/claimbuster-nsf); [IDIR lab](https://idir.uta.edu/?id=806)). Hoaxy/Botometer (Indiana) until the Twitter API shutoff killed them.
- **Evidence** – ClaimBuster is arguably the longest-lived service in the whole landscape – but it lives exactly as long as the PI's funding and the platform APIs it consumes, and offers no staffing or support path.
- **Durability** – excellent while the lab lasts; not a business, and dies by API revocation or grant expiry, not by market failure.

## Price points observed (first-party where available)

| Tier                          | Price                  | Source                                                                                                                                          |
| ----------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Consumer (NewsGuard app)      | $4.95/mo               | [NewsGuard FAQ](https://www.newsguardtech.com/newsguard-faq/)                                                                                   |
| Content-marketing SaaS (Pro)  | $14.95/mo              | [Originality.ai pricing](https://originality.ai/pricing)                                                                                        |
| Journalist seat (Factiverse)  | €25/mo                 | [Factiverse pricing](https://www.factiverse.ai/pricing)                                                                                         |
| Content-marketing enterprise  | $179/mo                | [Originality.ai pricing](https://originality.ai/pricing)                                                                                        |
| Platform contract (Full Fact) | £353,475/yr (Meta)     | [Press Gazette, from accounts](https://pressgazette.co.uk/platforms/cost-cuts-and-new-donors-help-full-fact-weather-loss-of-1m-google-funding/) |
| Grant, tool-scale             | $250k (GNI LatAm)      | [GNI Innovation Challenges](https://newsinitiative.withgoogle.com/resources/programs/innovation-challenges/)                                    |
| Grant, org-scale              | $500k–5.7M             | [Meedan/PJMF](https://meedan.org/post/patrick-j-mcgovern-foundation-pjmf-to-help-meedan-evolve-check), NSF Co-Insights                          |
| Enterprise data licensing     | undisclosed, recurring | [NewsGuard solutions](https://www.newsguardtech.com/solutions/newsguard/)                                                                       |

## Cross-cutting observations

- **Nobody pays for verdicts.** In every surviving model the buyer pays for monitoring, data, infrastructure, or workflow – never for an automated true/false call. NewsGuard sells ratings and fingerprints, not verdicts; Meedan sells (gives) workflow; Radar sells monitoring reports; Comprova itself dropped verdict labels in May 2025 ([Comprova](https://projetocomprova.com.br/about/)). VERITRACE's sellable surface is the observable investigation – the workbench and the trace – which is already what the project treats as the product ("advisory only… the journalist makes the final call", README).
- **Every dead or dying model shared one property**: its economics depended on a platform's continued goodwill – a contract (Logically), a program (Meta's TPFC), or an API (Hoaxy/Botometer). Models 5–7 pass the "what happens when the platform says no" test; models 1 and 9 fail it outright; 3 passes commercially but is politically exposed.
- **The customer is grant-funded.** With grants now 46.2% of the average fact-checker's income ([IFCN 2025](https://www.poynter.org/ifcn/2026/state-fact-checkers-2025/)), selling per-seat SaaS to fact-checkers means competing for pass-through grant money. Tools that go free-to-network and let the grant fund the builder (model 6) swim with this current instead of against it.

## What could sustain VERITRACE

VERITRACE is (per CONTEXT.md and README) an observability workbench: a thin all-API Next.js app, no proprietary model, no proprietary dataset beyond a small curated domain-credibility list, runs owned by the user, pt/es-oriented evals (X-Fact, Aos Fatos golds, ADR 0002), and a transparency ethos that treats the process as the product. That shape rules some models out and points hard at others.

**Poor fits**

- **Model 1 (platform contracts)** – no platform buyer exists post-2025, and the failure mode (Logically) is total.
- **Model 3 (data licensing)** – VERITRACE deliberately does not accumulate a proprietary dataset; runs are user-owned and the domain list is small. Licensing run traces as a corpus would collide with both the transparency ethos and users' ownership of their investigations.
- **Model 2 (comms/brand-safety repositioning)** – technically feasible (claim-verification for comms teams) and the historically proven survival route, but it converts the fact-checker workbench into a monitoring product for a different buyer. A conscious pivot, not a sustainability plan for the current mission.

**Plausible fits, in order**

1. **Model 5 + 6 hybrid – open-source core, grant-seeded, network-shared (recommended working assumption).** The evidence says this is the only cluster where every tool is alive, and VERITRACE's pt/es orientation points at the exact network where the pattern works: LatamChequea/Factchequeado (Chequeabot's channel) and Abraji/Comprova in Brazil. The concrete template is Radar Aos Fatos' two-layer structure – free/shared core for the network, paid institutional monitoring/reporting on top. VERITRACE's analogue of the paid layer would be hosted runs, institutional dashboards, or eval/report services for orgs that don't want to self-host, while the core stays open. Trade-offs: the grant treadmill (Full Fact's £1m Google cut shows even the best-run charity eats a 30%+ income shock), a shrunken 2025 grant pool, and the obligation to make self-hosting genuinely easy (which the thin all-API architecture, ADR 0001, already supports – a self-hoster brings their own Anthropic/Exa keys).
2. **Model 7 as the adoption channel.** One Comprova-scale coalition adopting the workbench is worth more than any number of individual seats, and coalition funding sustains the tools inside it. This is not a separate revenue model but the distribution strategy for model 6: the pitch is to Abraji/coalition funders, not to individual journalists.
3. **Model 4 as a top-up layer, strictly bounded.** A hosted individual tier must price at or under the observed €25/mo ceiling ([Factiverse](https://www.factiverse.ai/pricing)) and cover LLM + Exa per-run cost inside it. This makes the per-run cost work (#10/#62/#67) a business requirement: the eval/cost output should express cost as "runs per month at the Factiverse-seat price" so every pipeline change is checked against the only seat price the market has validated. Expect this layer to pay for hosting, not for development.
4. **Model 8, opportunistically, in BR/EU only.** Electoral-integrity procurement (TSE-adjacent) and EU programme calls (the vera.ai lineage proves a decade of continuity is possible) fit VERITRACE's geography and mission – as one leg among several, never the only one.
5. **Model 9 as the honest floor.** If VERITRACE remains a research artifact, the ClaimBuster path – free service, academic hosting, NSF-style funding – is the longest-lived precedent in the field, and it is fully compatible with adopting models 5/6 later.

**Proposed working assumption** (matching the issue's proposal): adopt the **5+6 hybrid** and record it as an ADR, so that downstream product choices inherit from it – the per-run cost ceiling (benchmark against €25/mo), the self-hosting story (keep the all-API, bring-your-own-keys shape first-class), and continued pt/es investment (the network is the market). The concrete next step is a scan of open grant windows that fit: GNI innovation-challenge-style programs ([GNI](https://newsinitiative.withgoogle.com/resources/programs/innovation-challenges/)), journalism-tech foundations active in this space (Patrick J. McGovern Foundation and Press Forward, both of which funded Meedan's Check – [PJMF](https://meedan.org/post/patrick-j-mcgovern-foundation-pjmf-to-help-meedan-evolve-check), [Press Forward](https://meedan.org/post/meedan-wins-press-forward-grant-to-pilot-new-software)), and EU Horizon calls in the vera.ai lineage ([CORDIS 101070093](https://www.cordis.europa.eu/project/id/101070093)) – while stress-testing every plan against the one question the 2025 shakeout settled: what happens when the platform says no.

## Source index

- Meta, More Speech and Fewer Mistakes (7 Jan 2025) – https://about.fb.com/news/2025/01/meta-more-speech-fewer-mistakes/
- IFCN/Poynter, State of the Fact-Checkers 2025 – https://www.poynter.org/ifcn/2026/state-fact-checkers-2025/ (PDF: https://www.poynter.org/wp-content/uploads/2026/03/2026-State-of-Fact-Checkers-4.pdf)
- Full Fact, Funding (first-party) – https://fullfact.org/about/funding/
- Press Gazette on Full Fact's 2024 accounts – https://pressgazette.co.uk/platforms/cost-cuts-and-new-donors-help-full-fact-weather-loss-of-1m-google-funding/
- Sifted on Logically's administration – https://sifted.eu/articles/logically-ai-fact-check-misinformation-trump-tiktok-meta
- UKTN on the Logically pre-pack sale – https://www.uktech.news/ai/ai-fact-checker-logically-sold-off-in-administration-deal-20250707
- NewsGuard solutions (first-party) – https://www.newsguardtech.com/solutions/newsguard/ · FAQ (consumer $4.95/mo) – https://www.newsguardtech.com/newsguard-faq/
- Factiverse pricing (first-party, Pro €25/mo) – https://www.factiverse.ai/pricing
- Originality.ai pricing (first-party) – https://originality.ai/pricing
- Meedan grant announcements (first-party) – https://meedan.org/post/patrick-j-mcgovern-foundation-pjmf-to-help-meedan-evolve-check · https://meedan.org/post/meedan-wins-press-forward-grant-to-pilot-new-software
- Chequeado/Chequeabot – https://solve.mit.edu/challenges/2024-global-economic-prosperity-challenge/solutions/87157 · https://www.poynter.org/fact-checking/2018/in-argentina-fact-checkers%c2%92-latest-hire-is-a-bot/
- Aos Fatos, Radar launch (first-party) – https://www.aosfatos.org/noticias/aos-fatos-launches-real-time-monitoring-system-against-misinformation/
- GNI Innovation Challenges – https://newsinitiative.withgoogle.com/resources/programs/innovation-challenges/
- Abraji, Comprova (first-party) – https://www.abraji.org.br/english/projects/comprova_project · https://projetocomprova.com.br/about/
- vera.ai / CORDIS Horizon Europe GA 101070093 – https://www.cordis.europa.eu/project/id/101070093 · https://www.veraai.eu/project-summary
- ClaimBuster / UTA (first-party) – https://www.uta.edu/news/news-releases/2017/08/24/claimbuster-nsf · https://idir.uta.edu/?id=806
- Graves, Boundaries Not Drawn (Journalism Studies 19(5), 2018) – https://doi.org/10.1080/1461670X.2016.1196602 – **metadata/abstract only, full text not read**
