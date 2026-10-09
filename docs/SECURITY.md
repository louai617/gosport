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
| Passwords are generated | Nobody chooses a password for someone else: the server generates it from the OS CSPRNG (`randomInt`, no modulo bias; unambiguous alphabet, ≥ 12 characters, honouring the configured minimum length and symbol rule), shows it **once** to the person creating the account, and stores only the Argon2id hash. It is never logged or audited. The holder must replace it at first sign-in. | `src/server/auth/credentials.ts`, `accountService.ts` |
| Password policy | What a holder chooses for themselves: ≥ 10 characters, mixed classes, ≤ 128, common-password deny-list. Minimum length and a symbol requirement are raised from the superadmin Settings screen. | `src/lib/validation.ts`, `settings/registry.ts` |
| Session token | 32 random bytes in an `httpOnly`, `sameSite=lax`, `secure` (production) cookie. The database stores only the **HMAC-SHA256** of the token, keyed by `SESSION_SECRET`. A database leak therefore yields no usable session. | `src/server/auth/session.ts`, `tokens.ts` |
| Not a JWT | A suspension, self-exclusion or role change must take effect on the *next request*. `readSession` re-reads the user row every time. | `session.ts` |
| Lifetimes | Idle and absolute timeouts, both enforced server-side. **Staff (managers and the superadmin) get shorter ones** (30 min idle / 8 h absolute by default). | `env.ts` (`SESSION_*`, `ADMIN_SESSION_*`) |
| Fixation / rotation | A new token is issued at sign-in and on every password change; password change and reset revoke all other sessions, and generating a new password for someone ends all of their sessions at once. | `authService.ts`, `accountService.ts` |
| Lockout | `failedLoginCount` / `lockedUntil` live on the user row, so they survive restarts and apply across instances. Threshold and duration are settings (default 5 failures → 15 min). | `authService.ts` |
| Enumeration | One error key for "unknown account" and "wrong password"; an unknown account still performs a dummy Argon2 verify so timing matches. (There is no sign-up and no forgot-password endpoint to probe.) | `authService.ts` |
| Forced change | `mustChangePassword` (set by the seed and on every generated password) blocks every page and API except the change-password flow. | `pageGuard.ts`, `guard.ts` |
| Account states | `PENDING`, `ACTIVE`, `SUSPENDED`, `LOCKED`, `SELF_EXCLUDED`, `CLOSED`. Only `ACTIVE` and `SELF_EXCLUDED` can hold a session (a self-excluded player can still see their account and withdraw, but cannot wager); moving to any other state revokes live sessions. | `playerAdminService.ts`, `sessionUser.ts` |

**There is no self-registration and no e-mail.** Accounts form a chain of ownership
(`User.createdById`): the superadmin creates managers, a manager creates players.
The first superadmin is created **only** by `npm run db:seed`, from `ADMIN_USERNAME` /
`ADMIN_PASSWORD` in the environment; there is no default account and no credential in
the repository, and the seeded account must change its password on first sign-in.
Break-glass access for the superadmin, without typing a password anywhere:
`npm run admin:recovery-link -- <username>` prints a single-use, expiring reset link
(stored only as a hash) and writes an audit record. Managers and players are recovered
by the account above them generating a new password.

---

## 3. Authorisation (RBAC)

Roles are `PLAYER`, `MANAGER` and `SUPERADMIN`. Decisions are made by
`can(role, permission)` (`src/server/auth/permissions.ts`), never by comparing a role
name at a call site; adding a staff role is a schema member plus one row in that table.

- **Superadmin:** every permission except `credit.distribute` (selling out of a balance
  is a manager's act; the superadmin issues credit instead, `credit.issue`).
- **Manager:** `admin.access`, `players.read/create/suspend/credentials`,
  `transactions.read`, `notifications.read`, `credit.distribute`, `withdrawals.process` (their
  own players' requests only) — nothing else. No
  dashboard, audit log, settings, reports, bets, wallet adjustments, withdrawal queue or
  other managers.
- **Scope.** A permission says the role may do the thing; **scope says to whom**.
  Every player lookup goes through `managedPlayerWhere(actor)` (`src/server/auth/scope.ts`):
  a manager reaches only `createdById = themselves`, and a guessed id outside that is
  "not found", never a read or a write. A manager's ledger view is limited to their own
  wallet and their players' (`userScope`). Only the superadmin reaches managers
  (`managedManagerWhere`).

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
above `wallet.adjustmentApprovalThreshold` need a **second superadmin**
(`AdjustmentRequest`): the requester cannot approve their own request. Credit
issued to a manager (`credit.issue`) does **not** go through that queue — with a single
superadmin there is nobody to approve — so it is audited `critical` and capped per
issue by `wallet.maxAdjustmentAmount`.

### The credit chain

```
superadmin ──issues──▶ manager ──sells──▶ player
 (ADMIN_CREDIT)        (CREDIT_TRANSFER − / DEPOSIT +, one transaction)
```

A sale is two ledger entries (the manager's debit through the guarded atomic update, the
player's `DEPOSIT` credit, linked by `relatedId`) in one database transaction, idempotent
on a client key, subject to the player's own deposit limits, and audited. A manager can
never sell more than they hold, however many requests race.

A player can **ask** for credit (`CreditRequest`, from the Deposit page). Asking moves nothing and
is addressed to the manager who created the player; at most three requests wait at once, and the
player can cancel a pending one. The manager's approval *is* a sale — the same guarded transaction
as above, so an oversized request is refused and the claim rolled back — and only requests
addressed to that manager are visible to them. The superadmin has no balance to sell from and cannot
decide them.

The chain runs back up on a withdrawal: when a request is **approved**, the player's held funds
leave the platform and the same amount returns to the player's manager as a `CREDIT_TRANSFER`
credit (so credit a manager sold is never silently destroyed); **rejecting** returns the funds to
the player. A manager decides only their own players' requests (anyone else's is "not found");
the superadmin can decide any, and the credit still goes to the player's manager. A player created
by the superadmin has no manager, so approving credits nobody.

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
| `passwordReset` (superadmin recovery link) | 5 / h | database |
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
player page and dashboard), and conditional claims so two superadmins cannot
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
- `redact()` strips anything keyed like a secret and bounds depth and length.
  Passwords, tokens and card data never reach it — a generated password appears in
  exactly one HTTP response and nowhere else; the integration suite asserts it is in no
  audit row.
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
- **E-mail / SMS.** None exists, by design: accounts carry no address or number. A
  lost password is replaced by the account above generating a new one.
- **Payments.** No provider. Credit is issued by the superadmin and sold on by
  managers; withdrawals are paid out by the operator out of band and then marked
  completed by the superadmin.
- **Identity and age verification.** `kycStatus` is a **manual operator
  decision**. Nothing checks anyone's age: whoever creates an account is responsible
  for the holder being of age.
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
non-`mock` adapter are configured. Beyond that gate: 2FA for staff accounts,
Redis rate limiting, audit shipping, an external penetration test, a
vulnerability-disclosure policy and a named security contact — and, above all,
the licensing and legal work in `COMPLIANCE.md`.
