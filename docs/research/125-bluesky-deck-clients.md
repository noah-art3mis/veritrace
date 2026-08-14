# TweetDeck-style clients for Bluesky (#125)

Question: does a TweetDeck equivalent exist for Bluesky, and how hard would one be to build?

## What exists

- **[deck.blue](https://deck.blue/)** – the de facto TweetDeck for Bluesky: multi-column with auto-refresh, multi-account (4 free), scheduling, muted words, hashtag/feed/list columns, keyboard shortcuts. Free with a paid tier; its developer works on it full-time ([PCWorld](https://www.pcworld.com/article/2797495/miss-tweetdeck-a-former-dev-made-a-similar-app-for-bluesky.html)).
- **[Skeetdeck](https://skeetdeck.j4ck.xyz/)** – lighter open-source multi-column deck.
- More clients listed on [AlternativeTo](https://alternativeto.net/software/deck-blue).

## Why building one is easy (relative to Twitter)

- **Open, free API.** AT Protocol has no API paywall, rate-limit rug-pulls, or dev-program gatekeeping – the failure mode that killed TweetDeck (API revocation) structurally can't recur the same way.
- **Tooling.** The official `@atproto/api` TypeScript SDK gives typed access to timelines, feeds, search, notifications, and posting; auth is an app password or OAuth.
- **Real-time built in.** The firehose/Jetstream websocket streams every network event, so live columns need no polling.
- The hard part is frontend grind, not data access: virtualized columns, threading, media upload, scheduling state. A read-only multi-column prototype is a weekend project; a daily-driver like deck.blue is a full-time job.

## Relevance to VERITRACE

The same properties that make deck clients easy make Bluesky the cheapest social platform to monitor for claims: full public firehose, no API fees, no partnership required. If VERITRACE ever ingests social posts for claim detection, Bluesky is the low-friction starting point.
