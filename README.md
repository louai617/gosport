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
>   the money is **demo credit**: no payment provider exists. The superadmin issues
>   credit, managers sell it on to their players, and withdrawals are marked paid
>   by the operator out of band.
> - Odds and results come from a built-in **dataset**, not a live feed.
> - Age and identity are **not verified**: whoever creates an account is responsible
>   for the holder being of age, and the verification status is a manual decision.
> - Accounts have a **username and password only** — no e-mail, no phone — and there
>   is **no two-factor authentication** yet.
>
> [`docs/COMPLIANCE.md`](docs/COMPLIANCE.md) lists the gates that must close before
> this could become a real product.

## What it does

**Nobody signs up.** A **superadmin** creates **managers** and issues them credit; a
**manager** creates **players** (the username and password are generated and shown
once) and sells them credit out of their own balance. Credit only ever moves down
that chain, and every step is a ledger entry and an audit record.

**Players** sign in with the credentials they were given (Argon2id, server-side
sessions; the generated password must be changed at first sign-in), see their
balance and full transaction history, place sportsbook tickets and play eight
casino games (dice, limbo, crash, mines, plinko, slots, blackjack, roulette) that
are **settled on the server** from a seed they can verify — picked from a lobby
they can filter, search and sort (most played first) — request withdrawals, set
deposit / stake / loss / single-bet limits, take a break or self-exclude, and
ask their manager for credit from the **Deposit** page (the manager approves, which sells it from their own balance), and manage their sessions.

**The superadmin** has the full console at `/admin`: a dashboard with period
filters and charts, managers (create, issue credit, generate a new password,
suspend), every player of every manager, wallet credits and debits with a four-eyes
approval above a threshold, a withdrawal queue, transaction and bet explorers with
per-leg settlement, reports with CSV export, an immutable audit log, runtime
settings and responsible-gambling oversight.

**A manager** has a small console scoped to their own book: their balance, the
players they created (create, generate a new password, suspend, sell credit, decide withdrawals) and
their own transactions — and **they approve or reject their players' credit requests and withdrawal requests**
(the cashed-out credit returns to the manager's balance). A manager cannot see another manager's players, the audit
log or any platform setting — the services enforce that, not just the menu.

**Underneath:** money is integer millimes in a `BigInt` ledger that the database
itself refuses to overdraw or rewrite; every state change writes an audit row in
the same transaction; every rule the UI shows is re-enforced on the server.

## Run it

Requires Node 22+. No database server needed locally (SQLite).

```bash
npm install
cp .env.example .env.local     # set SESSION_SECRET, PII_HASH_SALT, ADMIN_USERNAME / ADMIN_PASSWORD
npm run db:deploy              # create dev.db and apply migrations
npm run db:seed                # create the superadmin
npm run dev                    # http://localhost:3000
```

Sign in at `/login` as the superadmin (you must change the password first), create a
manager under **Managers**, issue them credit, then sign in as the manager and create a player.
Full setup, scripts and the Vercel / PostgreSQL deployment steps are in
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

| Script | |
|---|---|
| `npm run dev` / `build` / `start` | Development server / production build / serve it |
| `npm run typecheck` · `lint` | `tsc --noEmit` · ESLint |
| `npm run test:unit` | Settlement, period, CSV and fairness tests |
| `npm run test:integration` | 298 end-to-end checks against a running server (auth, RBAC, manager scoping, the credit chain, ledger, concurrency, withdrawals, casino, pages, audit) |
| `npm run verify` | Typecheck → client-boundary check → i18n audit → unit tests → production build |
| `npm run db:deploy` · `db:migrate` · `db:seed` · `db:studio` | Migrations, seed, data browser |
| `npm run admin:recovery-link -- <username>` | Break-glass single-use reset link for the superadmin |

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
