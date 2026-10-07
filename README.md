<div align="center">

# SportGo

**Bet smarter. Follow the game.**

A sports-betting and casino platform with player accounts, an administration
console and an audited credit ledger, built for the Tunisian market.

</div>

---

> ### ⚠️ Demo credits — not a licensed gambling operation
>
> SportGo is **not licensed** to offer gambling in Tunisia or anywhere else.
>
> - Accounts, balances, bets and transactions are **real database records**, but
>   the money is **demo credit**: no payment provider exists. An administrator
>   records credit; withdrawals are marked paid by an operator out of band.
> - Odds and results come from a built-in **dataset**, not a live feed.
> - Age and identity are **not verified**: the age box is a self-declaration and
>   the verification status is a manual operator decision.
> - There is **no e-mail transport** and **no two-factor authentication** yet.
>
> [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) lists the gates that must close before
> this could become a real product.

## What it does

**Players** register and sign in (Argon2id, server-side sessions), see their
balance and full transaction history, place sportsbook tickets and play eight
casino games (dice, limbo, crash, mines, plinko, slots, blackjack, roulette) that
are **settled on the server** from a seed they can verify, request withdrawals,
set deposit / stake / loss / single-bet limits, take a break or self-exclude, and
manage their sessions.

**Administrators** (role-based access) get a console at `/admin`: a dashboard with
period filters and charts, player management (create, search, suspend, lock,
restrict, verify, revoke sessions, issue reset links), wallet credits and debits
with a four-eyes approval above a threshold, a withdrawal queue, transaction and
bet explorers with per-leg settlement, reports with CSV export, an immutable
audit log, runtime settings and responsible-gambling oversight.

**Underneath:** money is integer millimes in a `BigInt` ledger that the database
itself refuses to overdraw or rewrite; every state change writes an audit row in
the same transaction; every rule the UI shows is re-enforced on the server.

## Run it

Requires Node 22+. No database server needed locally (SQLite).

```bash
npm install
cp .env.example .env.local     # set SESSION_SECRET, PII_HASH_SALT and ADMIN_EMAIL / ADMIN_PASSWORD
npm run db:deploy              # create dev.db and apply migrations
npm run db:seed                # create the first administrator
npm run dev                    # http://localhost:3000
```

Sign in at `/login` as the administrator (you must change the password first).
Full setup, scripts and the Vercel / PostgreSQL deployment steps are in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

| Script | |
|---|---|
| `npm run dev` / `build` / `start` | Development server / production build / serve it |
| `npm run typecheck` · `lint` | `tsc --noEmit` · ESLint |
| `npm run test:unit` | Settlement, period, CSV and fairness tests |
| `npm run test:integration` | 216 end-to-end checks against a running server (auth, RBAC, ledger, concurrency, withdrawals, casino, pages, audit) |
| `npm run verify` | Typecheck → client-boundary check → i18n audit → unit tests → production build |
| `npm run db:deploy` · `db:migrate` · `db:seed` · `db:studio` | Migrations, seed, data browser |
| `npm run admin:recovery-link -- <email>` | Break-glass single-use reset link for an administrator |

## Stack

Next.js 16 (App Router, RSC-first) · React 19 · TypeScript strict · Tailwind CSS v4 ·
Prisma 7 over **SQLite** (development) and **PostgreSQL** (production) · Argon2id ·
zod · zustand · lucide-react.

## Third-party code

Blackjack and roulette *rules* are adapted from
[casino-by-ai](https://github.com/Lemelson/casino-by-ai) by Lemelson (MIT). The
notice and a precise account of what was and was not taken are in
[`THIRD_PARTY_LICENSES.md`](THIRD_PARTY_LICENSES.md). Everything else — including
slots and plinko — is original to this repository.

## Documentation

| | |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Layers, request flow, ledger flows, admin console map |
| [`docs/DATABASE.md`](docs/DATABASE.md) | Schema, money model, database-enforced guarantees, migrations |
| [`docs/SECURITY.md`](docs/SECURITY.md) | Authentication, RBAC, CSRF, rate limits, audit, and what is *not* implemented |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | Local setup, Vercel, PostgreSQL, first administrator, operations |
| [`docs/GAMES.md`](docs/GAMES.md) | Casino games, provably fair, server-side settlement, provider integration |
| [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) | Regulatory posture and pre-launch gates |
| [`docs/CONTRACT.md`](docs/CONTRACT.md) | Build contract: tokens, RTL, i18n, accessibility, conventions |
| [`docs/BRAND.md`](docs/BRAND.md) | The mark, construction, usage |

## Languages

French (default) · Arabic (RTL) · English. Translations live in
`locales/<locale>/<namespace>.json` as flat dotted keys; no user-facing string is
hard-coded in a component, and `npm run audit:i18n` keeps the locales in step.

## Configuration

Currency, locale, time zone, legal age and jurisdiction are read from
`src/config/app.config.ts` (and the `NEXT_PUBLIC_*` variables in `.env.example`).
Operational rules — limits, lockout, maintenance mode, approval threshold — are
editable at runtime in **Admin → Settings**.
