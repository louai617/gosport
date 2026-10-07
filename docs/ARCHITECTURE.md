# SportGo — architecture

SportGo is a Next.js 16 (App Router) application with player accounts, an
administration console, a credit ledger, a sportsbook and eight casino games,
backed by Prisma over SQLite (development) or PostgreSQL (production).

> **Status.** Credits only; no payment provider, e-mail transport, automated KYC,
> two-factor authentication or gambling licence. The **sportsbook catalogue**
> (events, markets, odds, results) is a deterministic dataset in `src/data`
> — it is not a live feed, and the admin console does not edit it. Everything
> that concerns *money, accounts and bets* is real, persistent and audited.

---

## 1. Layers

```
┌────────────────────────────────────────────────────────────────────────┐
│ app/          Routes, layouts, server actions (app/actions), API routes │
│               Server Components by default; guards redirect or 404     │
├────────────────────────────────────────────────────────────────────────┤
│ components/   UI. ui/ = primitives; admin/, account/, games/, betting/, │
│               wallet/ … = domain. No data access except via props/fetch │
├────────────────────────────────────────────────────────────────────────┤
│ services/     Business operations. Each authorises itself             │
│               (requireUser / requirePermission) and returns DTOs      │
├────────────────────────────────────────────────────────────────────────┤
│ server/       Toolkit: db, env, auth (session, password, RBAC), security │
│               (rate limit, CSRF, audit, redaction), wallet ledger,     │
│               casino engine, settings, notifications, repositories     │
├────────────────────────────────────────────────────────────────────────┤
│ data/         Deterministic sportsbook catalogue (seeded PRNG)         │
├────────────────────────────────────────────────────────────────────────┤
│ lib/ types/ config/ i18n/ store/   Pure, shared, no I/O (money, period, │
│               settlement, csv, validation, game maths)                 │
└────────────────────────────────────────────────────────────────────────┘
```

Rules that keep it honest:

- **Authorisation lives in the service**, not the page. Layouts and pages render in
  parallel in the App Router, so a layout check protects nothing. Page guards
  (`server/auth/pageGuard.ts`) only redirect/404 for UX.
- `components/` never import `server/` or `data/`. `scripts/check-client-boundary.mjs`
  (part of `npm run verify`) catches a server module calling a `"use client"` export.
- Anything that runs inside `transact(tx => …)` reads and writes through `tx`
  (see `DATABASE.md` for why this matters on SQLite).
- `src/lib/settlement.ts`, `period.ts`, `csv.ts` and `lib/games/*` are pure and
  unit-tested; `scripts/integration-test.mts` drives the real HTTP API and database.

## 2. Request flow

```
browser ──► src/proxy.ts (CSP nonce, request id)
        ──► page (RSC)  ──► pageGuard ──► service ──► repository/Prisma
        ──► API route   ──► withRoute: rate limit → body → CSRF → auth → zod → handler → audit
        ──► server action ► runAction: rate limit → auth → zod → service → ActionState
```

Failures are i18n keys, never stack traces; the redacted error and a `requestId`
go to the audit trail. See `SECURITY.md` for the full threat model.

## 3. Money and the ledger

`Wallet.balance` is a `BigInt` of **millimes** (1 TND = 1000); the application
passes integer millimes and converts at the UI edge (`lib/money.ts`). Every
movement is an append-only `Transaction` carrying `balanceBefore`/`balanceAfter`,
a unique `reference` and an optional `(userId, idempotencyKey)`.
`server/wallet/ledger.ts#appendLedgerEntry` is the **only** writer: a guarded
atomic debit, idempotent replay, and the audit row in the same transaction.

| Flow | How it works |
|---|---|
| Credit | An administrator records an `ADMIN_CREDIT`/`DEPOSIT`/`BONUS` with a reason. Above `wallet.adjustmentApprovalThreshold` it becomes an `AdjustmentRequest` a *second* admin must approve. |
| Debit / adjustment | Same path; cannot overdraw (guarded update + CHECK constraint). |
| Withdrawal | The player requests → a `PENDING` `WITHDRAWAL` entry **holds** the funds. Admin approves (→ `COMPLETED`, the operator pays out of band) or rejects (→ `REVERSED` plus a `REFUND` entry referencing the original). A conditional claim prevents double processing. |
| Sportsbook bet | `bettingService` re-prices from the dataset, snapshots `BetLeg`s, debits the stake, writes the ticket — one transaction. An admin settles per leg; `lib/settlement.ts` computes the result. |
| Casino round | `server/casino/*` opens a `Bet(kind CASINO)`, debits, draws from the player's committed seed and settles/continues on the server (see `GAMES.md`). |

Deposits initiated by the player are refused — there is no provider to take them.

## 4. Accounts and access

- Sessions: opaque token in a cookie, HMAC stored in `Session`; idle and absolute
  expiry, shorter for admins; revoke-all on credential change or suspension.
- RBAC: `PLAYER` / `ADMIN`; the permission map is `server/auth/permissions.ts`.
- States: `PENDING · ACTIVE · SUSPENDED · LOCKED · SELF_EXCLUDED · CLOSED`, plus
  `wageringBlocked` / `withdrawalsBlocked` restrictions and a manual `kycStatus`.
- Settings (`Setting` table, registry in `server/settings/registry.ts`): maintenance
  mode, registration, verification-to-wager, transaction min/max, adjustment limits,
  approval threshold, large-transaction alert, lockout, password policy and the
  limit-increase cooling-off. Only settings the code **enforces** appear in the UI.
  Reads are cached for 5 s and invalidated on write.

## 5. Administration console (`/admin`)

| Area | Route | Notes |
|---|---|---|
| Dashboard | `/admin` | Period filter (today / 7 d / 30 d / month / last month / custom, in the market's time zone), KPIs, time series, ledger-integrity check, recent activity |
| Players | `/admin/players`, `/new`, `/[id]` | Search, filter, sort, paginate; create (invitation link or temporary password); detail tabs: profile, wallet, transactions, bets, activity, responsible gambling; suspend, lock, restrict, verify, revoke sessions, issue reset link |
| Transactions | `/admin/transactions` | Filter by type, status, date, amount, player; CSV export |
| Wallet | `/admin/wallet` | Adjustments, four-eyes approval queue, withdrawal queue |
| Bets | `/admin/bets` | Sportsbook tickets and casino rounds; per-leg settlement |
| Reports | `/admin/reports` | Deposits, withdrawals, bets, wins, net, active players; CSV |
| Audit | `/admin/audit` | Filter by actor, target, action, severity, outcome, date; read-only |
| Responsible gambling | `/admin/responsible-gambling` | Limits, exclusions, flagged players |
| Notifications, Settings, Security | `/admin/notifications` … | Admin alerts; runtime settings; active admin sessions |

Charts are dependency-free SVG (`components/admin/charts`), coloured with the
`--color-chart-*` tokens. Each admin screen is a Server Component that calls a
service; forms use server actions with `useFormAction` (keeps fields on error,
works without JS).

## 6. Player area

`/account` (overview, bets, transactions, profile, security with active sessions,
responsible-gambling limits, notifications) and `/wallet` (balance, history,
withdraw; deposit explains that credit is recorded by the operator). The header's
balance comes from `WalletProvider`, which every casino board shares so one round's
result updates the same number everywhere.

## 7. Internationalisation

French (default), Arabic (RTL) and English. Flat dotted keys in
`locales/<locale>/<namespace>.json`, loaded per request; the locale lives in a
cookie, so routes carry no `[locale]` segment. `npm run audit:i18n` checks every
literal key exists and that all locales share one key set. Server errors and
notifications are stored as **keys + params**, so they render in the reader's
language.

## 8. Directory map

```
prisma/            schema.prisma · migrations/{sqlite,postgresql} · seed.ts
scripts/           prisma-provider · admin-recovery-link · integration/unit tests · audits
locales/           en · fr · ar
docs/              this folder
src/
  proxy.ts         CSP + request id
  app/             (shell) public · (account) · (auth) · admin · api · actions
  components/      ui · layout · admin · account · auth · betting · games · wallet · responsible …
  services/        *Service.ts — one per domain (auth, wallet-admin, player-admin, betting,
                   responsible, analytics, reports, audit, notifications, search, …)
  server/          db · env · actions · api · auth · security · wallet · casino · settings
                   notifications · repositories
  lib/             money · period · zonedTime · settlement · csv · validation · games/*
  data/            sportsbook catalogue (dataset, not a feed)
```
