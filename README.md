<div align="center">

# SportGo

**Bet smarter. Follow the game.**

A sports-betting and sports-entertainment interface for the Tunisian market.

</div>

---

> ### ⚠️ This is a demonstration build
>
> SportGo is **not** a gambling operation and is **not licensed** to offer one,
> in Tunisia or anywhere else.
>
> - Every odd, balance, bet and transaction is **simulated** by the app itself.
> - No payment provider is contacted. Deposits and withdrawals **refuse** rather
>   than pretend to succeed.
> - The registration age checkbox is a **self-declaration**, not age verification.
> - No wager can be placed. Submitting a bet slip records a local demo ticket.
> - Casino games run against a **session balance in your browser**. No game
>   provider is connected, and none can be without a casino licence.
>
> Read [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) for the twelve gates that must
> close before this could become a real product.

---

## Run it

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. No database is required — the app runs entirely on a
deterministic mock dataset.

| Script | |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run verify` | Typecheck → translation audit → production build |
| `npm run smoke` | Request all 71 routes and assert the security headers |
| `npm run check:boundary` | Catch a server module calling a `"use client"` export |
| `npm run audit:i18n` | Check every `t()` key exists and all locales agree |
| `npm run prisma:format` | Format the schema (no DB connection needed) |

## Stack

Next.js 16 (App Router, RSC-first) · React 19 · TypeScript strict ·
Tailwind CSS v4 (CSS-first `@theme`) · zustand · zod · Prisma + PostgreSQL
(schema only) · lucide-react.

## Third-party code

Blackjack and roulette *rules* are adapted from
[casino-by-ai](https://github.com/Lemelson/casino-by-ai) by Lemelson (MIT).
The notice and a precise account of what was and was not taken are in
[`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md). Everything else —
including slots and plinko — is original to this repository.

## Documentation

| | |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Layers, folder structure, page map, implementation plan |
| [`docs/CONTRACT.md`](docs/CONTRACT.md) | The build contract: tokens, RTL, i18n, a11y, conventions |
| [`docs/DATABASE.md`](docs/DATABASE.md) | ERD, money handling, ledger model, settlement |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Threat model and where each control lives |
| [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) | Regulatory posture and pre-launch gates |
| [`docs/GAMES.md`](docs/GAMES.md) | Casino games, provably fair, game-provider integration |
| [`docs/BRAND.md`](docs/BRAND.md) | The mark, construction, usage |

## Languages

French (default) · Arabic (RTL) · English. Translations live in
`locales/<locale>/<namespace>.json` as flat dotted keys. No user-facing string
is hard-coded in a component.

## Configuration

Currency, locale, timezone, legal age and jurisdiction are all read from
`src/config/app.config.ts`. Re-pointing the product at another market changes
that one file.
