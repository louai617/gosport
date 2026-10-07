# SportGo — security

> **Demonstration build.** Accounts, sessions, balances, bets and the audit trail
> are real database records, but the money is demo credit: no payment provider is
> connected and no licence is held. This document describes the controls that
> exist in the repository and — in §9 — the ones that do not.

---

## 1. The rule everything else hangs off

**The client is never trusted. Every decision is re-made on the server, against
the database, for the user the session cookie belongs to.**

- Sportsbook tickets carry selection ids and a stake. The server re-prices each
  leg from its own dataset and snapshots the price into `BetLeg`; a total or a
  payout in the request body is ignored by construction.
- Casino rounds are drawn from a per-player committed seed. The browser only
  replays a result the server has already settled (see `GAMES.md`).
- Responsible-gambling limits, self-exclusion, restrictions, maintenance mode
  and verification gates are enforced inside `assertWagerAllowed` — in the same
  database transaction that takes the stake. A greyed-out button is presentation.

---

## 2. Authentication

| Concern | Control | Where |
|---|---|---|
| Password storage | **Argon2id** (m = 19 MiB, t = 2, p = 1 — the OWASP baseline) through `@node-rs/argon2`. No weak fallback exists. | `src/server/auth/password.ts` |
| Password policy | ≥ 10 characters, mixed classes, ≤ 128, common-password deny-list. Minimum length and a symbol requirement are raised from the admin Settings screen. | `src/lib/validation.ts`, `settings/registry.ts` |
| Session token | 32 random bytes in an `httpOnly`, `sameSite=lax`, `secure` (production) cookie. The database stores only the **HMAC-SHA256** of the token, keyed by `SESSION_SECRET`. A database leak therefore yields no usable session. | `src/server/auth/session.ts`, `tokens.ts` |
| Not a JWT | A suspension, self-exclusion or role change must take effect on the *next request*. `readSession` re-reads the user row every time. | `session.ts` |
| Lifetimes | Idle and absolute timeouts, both enforced server-side. **Administrators get shorter ones** (30 min idle / 8 h absolute by default). | `env.ts` (`SESSION_*`, `ADMIN_SESSION_*`) |
| Fixation / rotation | A new token is issued at sign-in and on every password change; password change and reset revoke all other sessions. | `authService.ts` |
| Lockout | `failedLoginCount` / `lockedUntil` live on the user row, so they survive restarts and apply across instances. Threshold and duration are settings (default 5 failures → 15 min). | `authService.ts` |
| Enumeration | One error key for "unknown account" and "wrong password"; an unknown account still performs a dummy Argon2 verify so timing matches; forgot-password answers identically either way. | `authService.ts` |
| Forced change | `mustChangePassword` (set by the seed and by admin-issued credentials) blocks every page and API except the change-password flow. | `pageGuard.ts`, `guard.ts` |
| Account states | `PENDING`, `ACTIVE`, `SUSPENDED`, `LOCKED`, `SELF_EXCLUDED`, `CLOSED`. Only `ACTIVE` and `SELF_EXCLUDED` can hold a session (a self-excluded player can still see their account and withdraw, but cannot wager); moving to any other state revokes live sessions. | `playerAdminService.ts`, `sessionUser.ts` |

The first administrator is created **only** by `npm run db:seed`, from
`ADMIN_EMAIL` / `ADMIN_PASSWORD` in the environment. There is no default
account, no credential in the repository, and the seeded account must change its
password on first sign-in. Break-glass access without typing a password anywhere:
`npm run admin:recovery-link -- <email>` prints a single-use, expiring reset
link (stored only as a hash) and writes an audit record.

---

## 3. Authorisation (RBAC)

Roles are `PLAYER` and `ADMIN`. Decisions are made by `can(role, permission)`
(`src/server/auth/permissions.ts`), never by comparing a role name at a call
site; adding a staff role is a schema member plus one row in that table.

Permissions: `admin.access`, `dashboard.read`, `players.{read,create,update,suspend,lock,credentials}`,
`players.sessions.revoke`, `wallet.{read,adjust,adjust.approve}`, `withdrawals.process`,
`transactions.read`, `bets.{read,settle}`, `reports.{read,export}`, `audit.read`,
`notifications.read`, `settings.{read,update}`, `search.use`, `rg.read`.

Layering — **the service is the control, the page guard is a convenience**:

1. **Services** call `requireUser()` / `requirePermission()` themselves
   (`src/server/auth/guard.ts`) against the role read from the database on that
   request. Layouts and pages render in parallel in the App Router, so a layout
   check cannot protect a page; this is the data-access-layer pattern.
2. **API routes and server actions** are wrapped by `withRoute` / `runAction`
   (`src/server/api.ts`, `actions.ts`), which add rate limiting, CSRF, validation,
   uniform errors and audit.
3. **Pages** use `pageGuard.ts` only to redirect or 404 nicely. A signed-in
   player requesting `/admin` gets a **404**, not a 403, so the console's
   existence is not confirmed.
4. **IDOR:** every player-scoped query filters on the session user id, never an
   id taken from the request. Admin reads of another player are audited.

Privileged operations additionally require a reason, and balance adjustments
above `wallet.adjustmentApprovalThreshold` need a **second administrator**
(`AdjustmentRequest`): the requester cannot approve their own request.

---

## 4. Request pipeline and CSRF

Every `/api` route runs through `withRoute`:

```
rate limit → read body once → CSRF → auth guard → zod → handler → audit
```

- **API routes:** `sameSite=lax` plus a double-submit CSRF token (`sportgo_csrf`
  cookie ↔ `x-csrf-token` header or form field), required for every unsafe
  method (`src/server/security/csrf.ts`). A route must explicitly opt *out*.
- **Server actions:** Next.js compares the `Origin` header with `Host` and refuses
  a mismatch before the action runs. Behind a proxy that rewrites `Host`, list the
  public hostname in `experimental.serverActions.allowedOrigins` (see `DEPLOYMENT.md`).
- Validation comes **after** auth, so an anonymous caller cannot use field errors
  as an oracle for internal models. Errors are i18n keys; `error.message` never
  reaches the client — the redacted error goes to the audit trail under a
  `requestId` the user can quote.
- Responses are `no-store` by default; a balance must never sit in a shared cache.

### Rate limits

| Policy | Limit | Store |
|---|---|---|
| `login` | 10 / 5 min | database |
| `register` | 5 / h | database |
| `passwordReset` | 5 / h | database |
| `password` (change) | 10 / 15 min | database |
| `deposit` / withdrawal | 10 / h | database |
| `betPlacement` | 120 / min | memory |
| `admin` | 240 / min | memory |
| `search` | 60 / min | memory |
| `api` | 240 / min | memory |

Keys are salted hashes of the address (`PII_HASH_SALT`), never raw IPs. The
**database** policies guard authentication and money and are correct across
serverless instances. The **memory** policies are per-instance — on Vercel each
instance counts separately — so treat them as a courtesy against accidents, not a
defence against a determined client. If the database limiter itself errors it
**fails closed** (HTTP 429).

---

## 5. Ledger and database integrity

Application code is not the only line of defence; the database refuses some
things outright (migrations `*_integrity_guards`, written separately for SQLite
and PostgreSQL):

- `Wallet.balance >= 0` — a debit that would overdraw cannot commit.
- Every ledger row satisfies `balanceAfter = balanceBefore + amount`.
- **`Transaction` is append-only.** UPDATE and DELETE are rejected, with one
  exception: a `PENDING` row may move once to a final status (how a withdrawal is
  approved or reversed). Corrections are new rows referencing the original.
- **`AuditLog` is immutable:** UPDATE and DELETE are rejected by trigger, and on
  PostgreSQL so is TRUNCATE.

The application adds: a guarded atomic debit (`updateMany … balance ≥ amount`),
unique `(userId, idempotencyKey)` so a retried request cannot double-spend,
`reconcileWallet` (balance must equal the sum of entries — shown on the admin
player page and dashboard), and conditional claims so two administrators cannot
both process one withdrawal.

Money is stored as `BigInt` **millimes** (1 TND = 1000); the application uses
integer millimes and converts to TND only at the UI edge (`src/lib/money.ts`).

---

## 6. Audit trail

`AuditLog` records who did what, to whom, when, from which address and user
agent (the raw address is kept here so an investigation can use it — it is
personal data and subject to your retention policy; rate-limit keys use salted
hashes instead), with a severity and outcome, covering sign-in/out and failures,
lockouts, password and credential events, every admin action, wallet
adjustments and approvals, withdrawal decisions, limits and exclusions, bet
settlement, settings changes, report exports and blocked/forbidden attempts.

- Money- and state-changing events pass `tx`, so the audit row commits **in the
  same transaction** as the change — either both exist or neither does.
- `redact()` strips anything keyed like a secret, hashes e-mail addresses, masks
  phone numbers and bounds depth and length. Passwords, tokens and card data
  never reach it; the CSV export contains no e-mail addresses.
- There is no API to edit or delete audit rows, and the database would refuse.
- Reading the log is itself permissioned (`audit.read`); exporting is audited.

---

## 7. Transport, headers and browser hardening

`src/proxy.ts` generates a per-request nonce CSP:

```
default-src 'self';
script-src  'self' 'nonce-<per-request>' 'strict-dynamic';
style-src   'self' 'unsafe-inline';
img-src     'self' data: blob:;
font-src    'self' https://fonts.gstatic.com;
connect-src 'self';
frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none';
upgrade-insecure-requests
```

Development adds `'unsafe-eval'` and `ws:` for HMR; neither exists in a
production build. `next.config.ts` adds `Strict-Transport-Security` (2 years,
preload), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, and a restrictive
`Permissions-Policy`. `style-src 'unsafe-inline'` is a known, accepted gap
(`next/font` and critical CSS emit inline `<style>`).

`x-forwarded-for` is trusted for the client address. Vercel overwrites a
client-supplied value; on any other host make sure the proxy overwrites rather
than appends.

---

## 8. Secrets

- Read once in `src/server/env.ts`, which throws if imported into a client
  bundle. Only `NEXT_PUBLIC_*` values (market, locale, mode) reach the browser.
- `SESSION_SECRET` and `PII_HASH_SALT` are required in production; the session
  secret refuses to fall back to a development value when `VERCEL` or
  `APP_MODE=live` is set.
- `.env.local` is git-ignored; `.env.example` is a template with no values.
- The seed's admin credentials are a one-time bootstrap input, never stored in
  the repository or echoed to logs.

---

## 9. Not implemented

Exhaustive by intent. These are gaps, not hidden features.

- **Two-factor authentication.** Not built; the strongest next step for admin
  accounts.
- **E-mail / SMS delivery.** Only an in-app notification channel and a console
  transport for development exist. Password-reset and invitation links are
  therefore issued by an administrator from the player page (or the CLI) and
  shown once — they are not sent.
- **Payments.** No provider. Deposits are recorded by an administrator;
  withdrawals are paid out by the operator out of band and then marked completed.
- **Identity and age verification.** `kycStatus` is a **manual operator
  decision**; the registration age tick-box is a self-declaration.
- **National self-exclusion register**, sanctions screening, device fingerprinting,
  velocity/anti-fraud rules.
- **Shared rate limiting for the memory-backed policies** (see §4). A Redis
  implementation of `RateLimiter` is the only change needed.
- **Off-host, hash-chained audit shipping.** The audit table is immutable in the
  database but lives in the same database as the data it audits; ship it to
  write-once storage for a regulated deployment.
- **Automated dependency/secret scanning and an external penetration test.**
- **Dashboard scale:** time series are bucketed in memory from at most 250,000
  rows per query; beyond that, move to SQL aggregation or a rollup table.

---

## 10. Before real money

`env.ts` refuses `APP_MODE=live` unless every provider, the licence and a
non-`mock` adapter are configured. Beyond that gate: 2FA for administrators,
Redis rate limiting, audit shipping, an external penetration test, a
vulnerability-disclosure policy and a named security contact — and, above all,
the licensing and legal work in `COMPLIANCE.md`.
