# Fact-checking software landscape – what exists, what it costs, and how it fared

Research for issue #123. A reference bank of software in and around VERITRACE's space: what each tool actually does (mechanism, not marketing), who runs it, its cost model, its current status, and what its fate suggests for VERITRACE. Claims are cited to primary sources (each tool's own site, repo, paper, or the operator's own announcement) where possible; where only secondary reporting or the issue's original draft could be confirmed, the claim is marked inline and listed under "Needs verification" at the end. Researched August 2026.

Anchor papers for the practitioner sections: Micallef, Armacost, Memon & Patil, _True or False: Studying the Work Practices of Professional Fact-Checkers_ (CSCW 2022, interviews with 21 fact-checkers in 19 countries – [doi:10.1145/3512974](https://dl.acm.org/doi/10.1145/3512974)) and Diakopoulos, _Computational News Discovery_ (Digital Journalism 2020 – [doi:10.1080/21670811.2020.1736946](https://www.tandfonline.com/doi/full/10.1080/21670811.2020.1736946)).

VERITRACE, for comparison: a document-first observability workbench – paste a Source text, the pipeline decomposes it into decontextualized Claims, generates Questions, retrieves primary Evidence live (Exa + LLM), and renders the whole trail as a traversable 4-layer evidence graph; the Verdict (AVeriTeC 4-way) is advisory and the Fact-checker decides (see `CONTEXT.md`, `README.md`).

## Research / academic systems

| Tool          | What it does                                                              | Price           | Status & outcome                                         |
| ------------- | ------------------------------------------------------------------------- | --------------- | -------------------------------------------------------- |
| HerO / HerO 2 | Full AVeriTeC pipeline: HyDE-FC retrieval → QA generation → 4-way verdict | Open source     | Shared-task runner-up; research code, no product         |
| ClaimBuster   | Check-worthiness scoring (0–1) + claim matching                           | Free API key    | Running since ~2017 – longest-lived academic service     |
| Squash        | Live debate fact-checking: speech → text → match vs ClaimReview DB        | Free (research) | Wound down 2021 after 4 years; honest documented failure |

### HerO / HerO 2 (Humane Lab, Soongsil University)

- **Mechanism**: an open-LLM pipeline for the AVeriTeC shared task – hypothetical fact-checking documents (HyDE-FC) for retrieval, question generation, and a 4-way verdict classifier. The repo describes itself as "a fact-checking pipeline based on open LLMs (the runner-up in AVeriTeC)" ([github.com/ssu-humane/HerO](https://github.com/ssu-humane/HerO)). Papers are vendored in this repo: `docs/papers/hero-2410.12377.pdf` ([arXiv:2410.12377](https://arxiv.org/abs/2410.12377)) and `docs/papers/hero2-2507.11004.pdf` ([arXiv:2507.11004](https://arxiv.org/abs/2507.11004)).
- **Cost**: free code; compute per the papers – HerO 1 ran on multi-H100 hardware (~48 s/claim for 500 claims (unverified against the PDF text – needs a re-read of `docs/papers/hero-2410.12377.pdf`)); HerO 2 was re-engineered to fit the AVeriTeC 2025 efficiency constraint of a single A10G-class GPU (per the HerO 2 paper).
- **Status**: alive as research code; no product.
- **For VERITRACE**: the direct methodological ancestor (AVeriTeC labels, HyDE, QA-as-explanation) – and the efficiency arc (frontier GPUs → one mid-range GPU in a year) says the _pipeline_ cost is collapsing; the defensible layer is the workbench and the observable trail, not the pipeline itself.

### ClaimBuster (IDIR Lab, UT Arlington)

- **Mechanism**: scores any sentence 0–1 for check-worthiness ("does this contain a factual claim whose truth matters to the public") and matches claims against previously checked ones – the ancestor of VERITRACE's `relevanceScore` triage. API docs and free key registration at [idir.uta.edu/claimbuster](https://idir.uta.edu/claimbuster) (redirects to `idir.claimbuster.org`); API described as "accessible by just registering for a free API key" ([API page](https://idir.uta.edu/claimbuster/api)).
- **Cost**: free.
- **Status**: alive – running continuously since ~2017, the longest-lived academic fact-checking service. Survival model: university lab with no revenue requirement.
- **For VERITRACE**: check-worthiness triage is a solved, freely available sub-problem; the university-lab model survives precisely because it never had to sell anything.

### Squash / Tech & Check (Duke Reporters' Lab)

- **Mechanism**: live fact-checking of debates and speeches – speech-to-text, then matching utterances against the ClaimReview corpus of published fact-checks, displaying a matched check seconds after the politician speaks ([reporterslab.org/tech-and-check](https://reporterslab.org/tech-and-check/)).
- **Cost**: free, grant-funded research.
- **Status**: development wrapped up in 2021 after four years. The lab's own post-mortem, [_The lessons of Squash_](https://reporterslab.org/2021/06/28/the-lessons-of-squash-our-groundbreaking-automated-fact-checking-platform/), is unusually honest: speech-to-text made "lots of mistakes," and the system "frequently stayed idle because there simply weren't enough claims that had been checked" – the bottleneck was the coverage of the human-written fact-check corpus, not the matching tech.
- **For VERITRACE**: the failure mode of _match-against-finished-checks_ is corpus sparsity – a structural argument for VERITRACE's de-novo approach (gather primary evidence fresh) over answer-key lookup. Also a reminder that a fact-check corpus can never keep up with the claim stream.

## The fact-checkers' actual toolbelt (Micallef et al., CSCW 2022)

The anchor finding of [_True or False_](https://dl.acm.org/doi/10.1145/3512974) (21 professional fact-checkers, 19 countries): the daily toolbelt is monitoring + OSINT + general-purpose search, participants are "inundated with information that needs filtering and prioritizing," and the verdict itself stays entirely manual. Almost nothing in daily use is a bespoke fact-checking AI – direct empirical support for VERITRACE's human-in-the-loop, advisory-verdict framing.

| Tool               | Role in the workflow                                    | Price                     | Status & outcome                                            |
| ------------------ | ------------------------------------------------------- | ------------------------- | ----------------------------------------------------------- |
| CrowdTangle        | Monitoring known misinformers; gauging claim popularity | Free                      | Dead – Meta shut it down 14 Aug 2024                        |
| TweetDeck / X Pro  | Real-time claim monitoring on Twitter                   | Free → $8/mo → $40/mo     | Paywalled 2023; moved behind Premium+ in Mar 2026           |
| Full Fact AI       | Claim detection + alerts + live transcription flagging  | Custom licensing; charity | Alive – 40+ orgs, 30 countries                              |
| InVID/WeVerify     | Video keyframes → reverse image search; media forensics | Free, EU-funded           | Alive (vera.ai); MIT-licensed                               |
| Google/Bing search | The core retrieval instrument                           | Free                      | The uncomfortable baseline                                  |
| Internet Archive   | Evidence preservation, deleted-content recovery         | Free (nonprofit)          | Alive; load-bearing infrastructure                          |
| LexisNexis         | Archival/legal database retrieval                       | Enterprise $$$            | Alive; the priced end of retrieval (unverified – needs URL) |

### CrowdTangle (Meta)

Free dashboard for monitoring public content spread across Facebook/Instagram – used by "tens of thousands of journalists, watchdogs, and election observers." Meta announced its shutdown in March 2024 and closed it on 14 August 2024, pointing users to the more restricted Meta Content Library ([CJR](https://www.cjr.org/tow_center/meta-is-getting-rid-of-crowdtangle.php); [Coalition for Independent Technology Research](https://independenttechresearch.org/press-release-meta-kills-crowdtangle-endangering-people-and-democracy-both-on-and-offline/); note: Meta's own announcement page was not fetched – secondary sources used). The toolbelt's biggest single loss, and a pure platform-goodwill dependency: the tool died because its owner's incentives changed, not because it stopped working.

### TweetDeck → X Pro

Free multi-column monitoring dashboard; rebranded X Pro and made subscriber-only in August 2023 ([TechCrunch](https://techcrunch.com/2023/08/15/x-formerly-twitter-makes-x-pro-formerly-tweetdeck-a-subscriber-only-product/)), then quietly moved behind the $40/mo Premium+ tier in March 2026 ([Engadget](https://www.engadget.com/social-media/x-moves-the-ashes-of-tweetdeck-behind-its-40-premium-subscription-210601250.html)). The softer version of the CrowdTangle death: the tool survives but its free-to-practitioners existence did not.

### Full Fact AI (Full Fact, UK charity)

Purpose-built fact-checker software: claim detection over media/transcripts, search by topic or speaker, and alerts when debunked claims resurface ([fullfact.org/ai](https://fullfact.org/ai/) – page confirmed via search snippets; direct fetch was not permitted). Used daily by 40+ fact-checking organisations in 30 countries across three languages ([Poynter](https://www.poynter.org/fact-checking/2025/the-uks-fact-checkers-are-sending-their-ai-to-help-americans-cover-elections/)). Funding is mixed: donations, philanthropy, platform payments, and software licensing with non-public custom pricing. The one purpose-built tool practitioners actually named in the CSCW study's lineage – and it automates _finding and matching_ claims, never the verdict.

### InVID/WeVerify verification plugin (AFP Medialab / vera.ai consortium)

A browser-extension "Swiss army knife": video keyframe extraction for reverse-image search, multi-engine image search fan-out, EXIF metadata, OCR, image forensics (ELA, copy-move), deepfake screening ([github.com/AFP-Medialab/verification-plugin](https://github.com/AFP-Medialab/verification-plugin); [weverify.eu/verification-plugin](https://weverify.eu/verification-plugin/); [vera.ai](https://www.veraai.eu/posts/verification-plugin)). Free, MIT-licensed, funded by EU Horizon grant 101070093. Alive and Poynter-praised. The EU-grant survival model – and the tool that covers exactly what VERITRACE's text-only build honestly cannot (media provenance / synthetic media, which VERITRACE correctly returns Not-Enough-Evidence for).

## Fact-checkers' in-house tech – Latin America & Spain

The region's fact-checkers built their own tooling – grant-funded, then shared across the network. Directly relevant: this is the pt/es world VERITRACE's eval golds target (X-Fact → Aos Fatos, ADR 0002).

| Tool                   | What it does                                                           | Price                               | Status & outcome                                                  |
| ---------------------- | ---------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------- |
| Chequeabot (Chequeado) | Scans ~30 outlets + speeches for checkable claims (es); matches priors | Free for Spanish-lang fact-checkers | Alive since 2017; used in 7+ countries                            |
| Radar Aos Fatos        | Real-time monitoring of the BR misinformation ecosystem, 6 platforms   | Grant-seeded; sold as monitoring    | Alive; ~90k publications analysed weekly                          |
| Fátima (Aos Fatos)     | Fact-check delivery chatbot (WhatsApp/Messenger; ex-Twitter)           | Free to the public                  | Alive in messenger form (unverified – needs URL)                  |
| ClaimHunter (Newtral)  | Unattended claim detection on Twitter + transcribed speech (es)        | Internal; piloted with LatAm orgs   | Alive; Newtral is a for-profit media/tech startup                 |
| FUNES (Ojo Público)    | Corruption-risk scoring over 245k+ public contracts                    | Free/journalistic                   | Alive; adjacent computational journalism (unverified – needs URL) |

### Chequeabot (Chequeado, Argentina)

AI that automatically scans ~30 media outlets, Congressional sessions, and presidential speeches to detect checkable phrases, match them against prior manual checks, measure virality, and transcribe audio/video in real time; an editorial feedback loop trains it ([chequeado.com/chequeabot](https://chequeado.com/chequeabot/); [La Nación](https://www.lanacion.com.ar/tecnologia/chequeabot-el-robot-de-chequeado-para-detectar-mas-rapido-frases-que-pueden-confirmarse-nid02042021/)). Developed alongside Full Fact and Africa Check; the trio won the 2019 Google AI Impact Challenge. Used in 7+ countries; Factchequeado deploys the tech for US Latino communities ([factchequeado.com](https://factchequeado.com/institucional/20230522/factchequeado-nyc-media-lab-tecnologia-chequeabot/)). The strongest example of the grant-seeded, network-shared survival model.

### Radar Aos Fatos (Aos Fatos, Brazil)

Real-time automated monitoring of Brazil's disinformation ecosystem: captures publications via APIs across websites, Twitter, YouTube, WhatsApp, Facebook and Instagram, then applies a five-stage linguistics + data-science methodology (in Python) to flag low-quality content with viralization potential – ~90,000 publications analysed weekly ([methodology page](https://www.aosfatos.org/metodologia-radar-aos-fatos/); [launch announcement](https://www.aosfatos.org/noticias/aos-fatos-lanca-sistema-de-monitoramento-em-tempo-real-contra-desinformacao/)). Grant-seeded (Google News Initiative innovation funding (unverified – needs URL)); monetized as institutional monitoring/reports. The computational-news-discovery stage of the pt-BR ecosystem – upstream of where VERITRACE sits.

### ClaimHunter / ClaimCheck (Newtral, Spain)

BERT-based unattended claim detection over the Twitter accounts of ~400 politicians plus transcribed speech, alerting journalists via Slack and learning from their feedback – ~80% F1 in real-life testing, a claimed 10× increase in reviewed claims/day and 90% time saved in political monitoring ([ClaimHunter paper, CEUR-WS](https://ceur-ws.org/Vol-2877/paper3.pdf); [Poynter](https://www.poynter.org/fact-checking/2022/how-will-automated-fact-checking-work/)). Promising results in Catalan and Galician; shared with other newsrooms. The one commercial fact-checker-built stack in this section (Newtral is a for-profit).

### Projeto Comprova and the Brazilian scene

- **Projeto Comprova** (Abraji coalition, 40+ newsrooms including Estadão Verifica, UOL Confere, Aos Fatos, Lupa): collaborative cross-verification – multiple newsrooms independently confirm before publication; WhatsApp tipline ([projetocomprova.com.br](https://projetocomprova.com.br/)). **The headline datapoint: since June 2025 Comprova has abolished its "falso"/"enganoso"/"satírico"/"comprovado" labels entirely**, in its own words because labels "create an obstacle to the necessary connection between verification and the audiences most affected by disinformation"; verifications now investigate who created the material, their interests, and **the persuasion tactics used** – a shift from "project against disinformation" to "project for information integrity" ([Comprova's first-party explanation](https://projetocomprova.com.br/publica%C3%A7%C3%B5es/por-que-o-comprova-aboliu-as-etiquetas-de-falso-e-enganoso/); [LatAm Journalism Review](https://latamjournalismreview.org/pt-br/articles/comprova-elimina-etiquetas-falso-e-enganoso-em-mudanca-de-estrategia-contra-desinformacao/)). After seven years of labeled verdicts, a 40-newsroom coalition concluded labels were the wrong output – the strongest field validation yet for VERITRACE's advisory/withholdable verdict (#3/#39) and the proposed rhetoric/persuasion-tactics lens (#122).
- **Newsroom desks** – Fato ou Fake (Globo), Estadão Verifica, UOL Confere, Agência Lupa: manual verification desks funded by parent orgs; the _practice_ VERITRACE would instrument, not competitors.
- **PegaBot** (ITS Rio): bot-likelihood scoring for Brazilian Twitter profiles – effectively hobbled by the same X API lockdown that froze Botometer (unverified – needs https://pegabot.com.br/ or an ITS Rio statement).
- **UFMG WhatsApp/Telegram Monitor** (Benevenuto et al.): collects public political WhatsApp (2018→) and Telegram (2022→) group content into trending dashboards for journalists/researchers; became the electoral court TSE's formal monitoring partner (unverified – needs a UFMG or TSE first-party URL). Where no platform API exists, an academic partnership became the infrastructure.

## Computational news discovery (Diakopoulos, 2020)

CND = algorithms that orient editorial attention to potentially newsworthy material – the upstream neighbour of fact-checking (find the claim vs check the claim) ([Diakopoulos 2020](https://www.tandfonline.com/doi/full/10.1080/21670811.2020.1736946)). VERITRACE's check-worthiness triage (`relevanceScore`, ADR 0005) is a CND component embedded in a verification tool.

| Tool           | What it does                                                | Price                | Status & outcome                                                      |
| -------------- | ----------------------------------------------------------- | -------------------- | --------------------------------------------------------------------- |
| Reuters Tracer | News detection + veracity scoring from the Twitter firehose | Internal (Reuters)   | Effectively retired – built on privileged Twitter access (unverified) |
| Dataminr       | Real-time event/anomaly alerts from social + open data      | Enterprise $$$       | Alive – sells mainly to corporate risk/public sector (unverified)     |
| NewsWhip       | Predictive social-engagement monitoring                     | Enterprise SaaS      | Alive – sells to comms/PR as much as journalism (unverified)          |
| Klaxon         | Monitors web pages for newsworthy changes; Slack alerts     | Free, open source    | Alive – repo active, pushed Aug 2026                                  |
| Newsworthy     | Statistical lead detection over open government data        | Modest newsroom SaaS | Alive; narrow structured-data niche (unverified – needs URL)          |

Reuters Tracer's mechanism is documented first-party in [arXiv:1711.04068](https://arxiv.org/abs/1711.04068): topic-agnostic bottom-up detection over 12M+ tweets/day, distilling news covering ~70% of what Reuters/AP/CNN journalists reported, _including a veracity estimate_ – the closest a newsroom system came to automated verification at scale. Its retirement (no first-party announcement found; inferred from the death of privileged Twitter data access) is the newsroom edition of the platform-dependency death. Klaxon's status was verified directly: The Marshall Project's repo ([github.com/themarshallproject/klaxon](https://github.com/themarshallproject/klaxon)) is unarchived and was pushed to on 2026-08-11 – the nonprofit + open-source survival model, again.

## Spread trackers (the OSoMe lineage)

| Tool      | What it does                                            | Price            | Status & outcome                                    |
| --------- | ------------------------------------------------------- | ---------------- | --------------------------------------------------- |
| Hoaxy     | Visualized diffusion networks of misinfo vs fact-checks | Free             | Retired 2025 after 8 years; folded into OSoMeNet    |
| Botometer | Bot-likelihood scoring for Twitter accounts             | Free → API tiers | Archival mode ("Botometer X"), data frozen mid-2023 |

- **Hoaxy** (Indiana University OSoMe): rendered the diffusion graph of a claim vs its fact-checks on Twitter – an _observable graph of spread_, not veracity. OSoMe's own announcement: "After 8 amazing years, Hoaxy is retiring! Its legacy lives on in OSoMeNet" ([@OSoMe_IU on X, Jul 2025](https://x.com/OSoMe_IU/status/1949394974262350098)); the old tool page `osome.iu.edu/tools/hoaxy` now returns HTTP 404 (checked Aug 2026), and the surviving [hoaxy.osome.iu.edu FAQ](https://hoaxy.osome.iu.edu/faq) requires users to supply their own X bearer token. Root cause: X's paywalling of API access.
- **Botometer → Botometer X**: OSoMe's own blog is explicit – "The original Botometer website was disabled after Twitter (now X) suspended free access to their data for researchers"; Botometer X serves only "pre-calculated scores based on historical data collected before June 2023," with no records of accounts created after 31 May 2023 ([OSoMe blog](https://osome.iu.edu/research/blog/introducing-botometer-x)).
- **For VERITRACE**: Hoaxy is the closest ancestor of the "observable graph" idea – but its graph was _diffusion_, VERITRACE's is _evidence_. Its death is the cleanest possible demonstration that a tool whose entire data supply is one platform's API dies when that API does. VERITRACE's graph is built from the open web via a swappable search provider – a categorically smaller dependency surface, but Exa and the Google Fact Check API deserve the same scrutiny (#121, #70/#71).

## Commercial verification companies

| Tool           | What it does                                       | Price                        | Status & outcome                                                       |
| -------------- | -------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------------- |
| Logically      | AI + analyst misinformation detection at scale     | Enterprise contracts         | Pre-pack administration, July 2025; assets sold                        |
| Factmata       | Claim/harm detection API → narrative monitoring    | –                            | Acquired by Cision (Nov 2022); absorbed, gone                          |
| The Factual    | Algorithmic news credibility scoring               | Freemium                     | Acquired by Yahoo (Aug 2022); product discontinued (partly unverified) |
| NewsGuard      | Human-curated source reliability ratings           | $4.95/mo consumer; licensing | Alive; politically contested in the US                                 |
| Factiverse     | AI editor: claim detection + live source retrieval | Free tier; Pro €25/mo        | Alive; small-SaaS for journalists/comms                                |
| Originality.ai | Fact-checker bundled with AI/plagiarism detection  | ~$14.95–179/mo or $30 PAYG   | Alive; sells to content marketers                                      |

### Logically (UK) – the big failure

Founded 2017; combined human fact-checkers with AI and digital forensics, selling verification/moderation services at platform scale; raised roughly £30M (unverified precise figure – needs a funding-round primary). Both Meta and TikTok ended their contracts, and in July 2025 Logically went through a pre-pack administration; Kreatur Ltd (run by an early Logically investor) bought the core technology, brand and assets, preserving ~50 roles ([Sifted](https://sifted.eu/articles/logically-ai-fact-check-misinformation-trump-tiktok-meta); [UKTN](https://www.uktech.news/ai/ai-fact-checker-logically-sold-off-in-administration-deal-20250707); [BusinessCloud](https://businesscloud.co.uk/news/rise-fall-of-yorkshire-firm-sold-in-pre-pack-administration-deal/) – no first-party insolvency statement survives on logically.ai, so reputable reporting is the fallback here). Cause of death: revenue concentrated in platform moderation contracts, which evaporated in the post-2024 moderation retreat. The canonical warning against building a fact-checking business on a handful of platform contracts.

### Factmata (UK)

Claim/harm-detection API that pivoted to narrative monitoring; acquired by PR-software giant Cision on 17 Nov 2022 – Cision's own release frames it purely as media monitoring ([PRNewswire/Cision](https://www.prnewswire.com/news-releases/cision-acquires-media-monitoring--technology-leader-factmata-301680397.html); [TechCrunch](https://techcrunch.com/2022/11/17/pr-software-giant-cision-acquires-factmata-the-fake-news-startup-that-pivoted-to-monitoring-all-kinds-of-online-narratives/) notes the deal took all seven employees). The fact-checking product is effectively gone, absorbed into brand-reputation tooling.

### The Factual (US)

Algorithmic credibility/bias scoring over 10,000+ news articles/day; acquired by Yahoo, closing 23 Aug 2022, founders absorbed into Yahoo News ([Yahoo's own press release](https://www.yahooinc.com/press/yahoo-announces-acquisition-of-the-factual-expanding-its-commitment-to-trusted-news-and-information)). Subsequent discontinuation of the standalone product is asserted by the issue draft but no first-party shutdown notice was found (unverified – needs a Yahoo or thefactual.com notice).

### NewsGuard (US)

Human analysts rate news sources on transparent criteria – the commercial cousin of VERITRACE's static `lib/domain-credibility.ts` list. Consumer browser extension at $4.95/mo; the real business is licensing its ratings and "false claim fingerprints" databases to platforms, AI companies, advertisers and researchers; free on Edge via a Microsoft license ([NewsGuard FAQ](https://www.newsguardtech.com/newsguard-faq/)). Alive; politically contested in the US (unverified specifics – the issue draft's claim; needs a citation on the 2025 political challenges).

### Factiverse (Norway) – the nearest commercial neighbour

Founded 2020 (University of Stavanger research spin-out); an "AI editor" that detects claims in text and retrieves live sources across search engines and 200M+ scientific articles to support or dispute each claim. Pricing: free tier (with tight input limits), Pro at €25/mo, 14-day trial, and a free-for-fact-checkers program ([factiverse.ai/pricing](https://www.factiverse.ai/pricing) – confirmed via search snippets; direct fetch not permitted). Functionally the closest commercial product to VERITRACE – but it explains via a citation list per claim, not an observable reasoning graph; there is no decompose → question → trace trail to scrutinize. Its €25/mo seat is the best available willingness-to-pay anchor for a journalist-facing tool.

### Originality.ai

Automated fact-checker bundled with AI-detection and plagiarism tools, priced for content marketers: Pro $14.95/mo (2,000 credits), Enterprise $179/mo, pay-as-you-go $30/3,000 credits; the fact-checker costs 1 credit per 10 words ([originality.ai/pricing](https://originality.ai/pricing) via search snippets). Survives by selling to a different market (SEO/content teams) than fact-checkers – market repositioning as survival strategy.

## Journalist workbenches & utilities

| Tool                       | What it does                                      | Price                     | Status & outcome                                       |
| -------------------------- | ------------------------------------------------- | ------------------------- | ------------------------------------------------------ |
| Meedan Check               | Collaborative verification + tipline claim intake | Open source; grant-funded | Alive; tiplines across Brazil, India, Kenya, Mexico... |
| Google Fact Check Explorer | Search over the ClaimReview corpus + free API     | Free                      | Alive – but Search rich results killed June 2025       |

### Meedan Check

Open-source verification platform: citizens forward content from WhatsApp/Telegram to tiplines connected to Check, partner orgs verify collaboratively, responses flow back ([meedan.org – tipline program](https://meedan.org/post/one-of-year-of-running-the-end-end-to-fact-checking-project); partners in Brazil, India, Indonesia, Kenya, Mexico, Spain, US, Zambia). Funding is grants at scale – a $5.7M NSF award (2021), Swedish SIDA for Check Global, McGovern Foundation ([Meedan posts](https://meedan.org/post/meedan-welcomes-3-new-brazilian-partners)). Nonprofit + open source + grants: no revenue requirement, hence durable. The workbench that organizes the _humans_; VERITRACE instruments the _investigation_.

### Google Fact Check Tools (Explorer + API)

Search over the ClaimReview corpus, plus the free claim-search API VERITRACE integrates as an optional waypoint (#19) ([developers.google.com/fact-check/tools/api](https://developers.google.com/fact-check/tools/api)). Still alive as of Aug 2026 – but in June 2025 Google removed fact-check rich results from Search entirely as part of "simplifying" results ([Nieman Lab](https://www.niemanlab.org/2025/06/google-kills-the-fact-checking-snippet/); [Poynter](https://www.poynter.org/ifcn/2025/google-claimreview-fact-checks-snippets-removed/); Google's own docs now note ClaimReview markup no longer produces a rich result – [Search Central](https://developers.google.com/search/docs/appearance/structured-data/factcheck)). Full Fact's response: ["The web just got a little harder to trust"](https://fullfact.org/technology/the-web-just-got-a-little-harder-to-trust/). The ecosystem's distribution rails are being pulled up even where the data survives – issue #121's dependency-risk analysis stands.

## Cross-cutting lessons

1. **Platform-API/contract dependency is the #1 cause of death.** Hoaxy (X API – [OSoMe's own retirement notice](https://x.com/OSoMe_IU/status/1949394974262350098)), Botometer ([OSoMe blog](https://osome.iu.edu/research/blog/introducing-botometer-x)), CrowdTangle (Meta's own shutdown), TweetDeck-as-free-tool (X paywall), Reuters Tracer (privileged firehose), and Logically (platform moderation contracts) all died, froze, or shrank when a platform withdrew access – none died of bad technology. VERITRACE's external surface is Exa + Anthropic-compatible LLM APIs + the optional Google Fact Check API: all swappable commodities rather than privileged access, but the degradable-run work (#70/#71) and the #121 watch on Google are exactly the right instinct.
2. **The pure-play VC-funded "AI fact-checking company" has failed three times** – Logically (administration), Factmata (absorbed into PR software), The Factual (absorbed into Yahoo). The models that survive: university lab (ClaimBuster), EU/foundation grants + open source (WeVerify plugin, Meedan Check, Klaxon), charity with software licensing (Full Fact), grant-seeded tools shared free across the fact-checking network (Chequeabot, Radar Aos Fatos), cheap individual SaaS (Factiverse €25/mo, Originality.ai), data licensing (NewsGuard), repositioning outside journalism (Dataminr → corporate risk, NewsWhip → PR, Originality → content marketing), and state-institutional (TSE/UFMG). The network-shared model is arguably the best-fit reference for VERITRACE.
3. **Practitioners' real toolbelt is general-purpose, and verdicts stay human** ([Micallef et al.](https://dl.acm.org/doi/10.1145/3512974)). Even the purpose-built survivors (Full Fact AI, Chequeabot, ClaimHunter) automate _finding and matching_ claims, never adjudication. Validation of the advisory-verdict stance – and a warning about adoption: a new tool competes with Google-plus-habit, not with other fact-checking AIs.
4. **The field is moving from labels to explanations.** Comprova – a 40+-newsroom coalition – abolished "falso"/"enganoso" labels in mid-2025 in favour of explaining creators' interests and persuasion tactics, [in its own words](https://projetocomprova.com.br/publica%C3%A7%C3%B5es/por-que-o-comprova-aboliu-as-etiquetas-de-falso-e-enganoso/). Convergent with Warren et al. (CHI 2025) and with VERITRACE's withholdable verdict (#3/#39) and the rhetoric-lens proposal (#122).
5. **Match-against-finished-checks hits a corpus wall.** Squash's own post-mortem: the system idled because too few claims had ever been checked. The human fact-check corpus will always trail the claim stream – the structural argument for de-novo evidence gathering.
6. **The pipeline has stages, and existing software clusters at the edges.** Monitoring/CND tools (Chequeabot, Radar, Tracer, Klaxon, Dataminr) find the claim; archives preserve evidence; chatbots and tiplines (Fátima, Check) distribute and intake; coalitions (Comprova) organize humans. The _investigation middle_ – decompose → question → retrieve → trace – is where the toolbelt is thinnest, and it is where VERITRACE sits. Nobody occupies the exact spot: Factiverse is closest but explains via citation lists; Hoaxy had the observable-graph DNA but for diffusion, not evidence.
7. **Cost reference points.** Self-hosted academic SOTA trends from multi-H100 to a single mid-range GPU in a year (HerO → HerO 2); willingness-to-pay anchors at €25/mo (Factiverse journalist seat), $4.95/mo (NewsGuard consumer), $14.95/mo (Originality content-marketer), and enterprise-$$$ (Dataminr/LexisNexis); the LatAm network norm is free-to-the-network, grant-funded. Worth revisiting the per-run cost display (#10/#62/#67) against the €25/mo anchor.

## Needs verification

Claims retained from the issue draft that could not be confirmed against a primary (or any) source in this pass:

- HerO 1's exact compute figure (~6.6 h on 2×H100 for 500 claims, ~48 s/claim) – re-read `docs/papers/hero-2410.12377.pdf` and `hero2-2507.11004.pdf` (the single-A10G constraint) directly.
- Fátima chatbot's current form and the death of its Twitter arm – needs an Aos Fatos first-party page.
- FUNES (Ojo Público) details – the issue cites a [GIJN story](https://gijn.org/stories/calculating-corruption-perus-ojo-publico-creates-tool-to-gauge-contracting-risks/), not verified here.
- PegaBot's current status – needs pegabot.com.br or an ITS Rio statement.
- UFMG monitor ↔ TSE partnership – needs a UFMG/TSE first-party URL.
- Radar Aos Fatos' GNI/Google Innovation Challenge 2019 seed funding – needs the award announcement.
- Reuters Tracer's retirement, Dataminr's and NewsWhip's current market mix, Newsworthy's pricing, LexisNexis pricing tier – all plausible but uncited here.
- Logically's cumulative funding (~£30M) – needs Companies House filings or funding-round primaries.
- The Factual's post-acquisition discontinuation – needs a Yahoo notice.
- NewsGuard's 2025–26 US political contestation – needs specific citations.
- Meedan Check's "~143k users across 58 tiplines" figure from the issue draft – not confirmed; current tipline counts need a Meedan source.
- Micallef et al.'s toolbelt inventory (CrowdTangle/TweetDeck named as the monitoring workhorses) – consistent with the paper's abstract and secondary coverage, but the full text behind the ACM paywall was not re-read in this pass.
