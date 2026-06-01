# DIY all-API backend in TypeScript, not a forked research pipeline

**Status:** accepted

All of our background research (the landscape map, the notes, the README prior-art table) points at forking an existing open fact-checking pipeline — HerO, FEVER-8, or Loki. We deliberately did **not**. Instead we build the claim → decompose → question → retrieve → verify pipeline ourselves, with a frontier LLM (Anthropic) as the reasoning engine and a hosted search API (Exa) for retrieval — every NLP stage is an HTTP call, with no local model, no PyTorch, and no GPU in the critical path. The whole app is a single Next.js (TypeScript) project deployed on Vercel.

**Why this is surprising:** a future reader sees a repo full of research on AVeriTeC/HerO/Loki and a TypeScript app that uses none of it, and reasonably asks "why ignore all that prior art?"

**The trade-off we made:** forking a research pipeline buys benchmark-grade _accuracy_ and academic credibility, but costs GPU dependency (the AVeriTeC rules cap systems at one 23GB GPU), 30–50s/claim latency, CC-BY-NC licensing, multi-hour environment setup, and an output format we'd have to fight to emit our graph schema. For a 9-hour hackathon whose entire differentiator is a _live, streaming, traversable evidence graph_ — not verdict accuracy — we optimized for demo speed, live latency (~5–8s/claim), total control of the graph schema, and one-command deploy. The research pipelines are accuracy baselines; we are not competing on accuracy, we are competing on observability.

**Escape hatch (the explicit no):** if a specific local research model is ever genuinely required (e.g. real Binoculars AI-text detection for a slop module), it gets quarantined as a single Python inference sidecar on Modal/Replicate behind HTTP — the app stays TypeScript. We are not introducing Python into the main app.
