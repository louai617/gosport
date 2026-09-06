# SportGo — security

> **Demonstration build.** No credential is stored, no session is durable, no
> money moves, no wager is booked. What follows describes the architecture a
> licensed deployment would run, the parts of it that exist in this repository,
> and — in §6 — the parts that explicitly do not.

---

## 1. The rule everything else hangs off

**All wagering validation is server-side. The client calculation is display-only.**

`src/lib/betting.ts` computes combined odds, potential return and system lines
in the browser so the bet slip can update as the player types. It has no
authority. A placement request carries selection ids, a stake and the price the
player *saw*; it does not carry a total, a return, or a payout, and
`betPlacementSchema` in `src/lib/validation.ts` refuses those fields by simply
not accepting them.

The server re-prices every selection against its own book, re-checks the market
is open, re-applies the stake and liability limits, and re-runs
`assertNotSelfExcluded`. If the price moved, the request is rejected unless the
player opted into `acceptOddsChange`. Anything a client can compute, a client
can forge.

The same rule applies to the responsible-gambling controls. A greyed-out button
is presentation. `src/server/auth/guard.ts` is the control.

---

## 2. Threat model

| Threat | Control | Where |
|---|---|---|
| **Credential stuffing / brute force** | Per-IP sliding-window limit on `login` (5 / 5 min), `register` (5 / h), `passwordReset` (3 / h); keys are hashed IPs, never raw. Password policy with a common-password deny-list. | `src/server/security/rateLimit.ts`, `src/lib/validation.ts` |
| **Weak or reused passwords** | Min 10 chars, mixed classes, no cap below 128, deny-list, advisory strength meter. Argon2id parameters fixed at the OWASP baseline. | `src/lib/validation.ts`, `src/server/auth/password.ts` |
| **Credential database theft** | Argon2id (m=19 MiB, t=2, p=1) or bcrypt cost ≥ 12. Sessions store a SHA-256 of the token, never the token. | `src/server/auth/password.ts`, `src/server/auth/session.ts` |
| **Session theft / fixation** | Opaque 32-byte token, `httpOnly` + `secure` + `sameSite=lax`, separate idle and absolute timeouts, `rotateSession` on every privilege change, `revokeAllSessions` on password change. | `src/server/auth/session.ts` |
| **User enumeration** | One i18n error key for "unknown email" and "wrong password"; forgot-password answers identically whether or not the address exists; login must run a dummy verify on an unknown account so the timing matches. | `src/server/api.ts`, `src/server/auth/password.ts` |
| **CSRF on state-changing routes** | `sameSite=lax` first; double-submit token plus an `Origin` check as defence in depth. Enabled by default for every unsafe method — a route must opt *out*, and only a signature-authenticated webhook may. | `src/server/security/csrf.ts`, `withRoute` |
| **XSS** | React escapes by default; per-request nonce with `script-src 'strict-dynamic'` so injected markup cannot load script; `object-src 'none'`; `escapeHtml` for the non-React outputs (email, CSV). | `middleware.ts`, `src/server/security/sanitize.ts` |
| **Clickjacking / UI redress on the bet slip** | `frame-ancestors 'none'` in the CSP, `X-Frame-Options: DENY` as the legacy fallback. | `middleware.ts`, `next.config.ts` |
| **Open redirect used for phishing** | `safeRedirect` is deny-by-default: protocol-relative, off-origin and non-http(s) targets all fall back. | `src/server/security/sanitize.ts` |
| **Underage access** | `dateOfBirthSchema` enforces `JURISDICTION.legalAge`. The registration tick-box is a **self-declaration, not verification** — the account must stay gated on a verified `kycStatus` before real play. | `src/lib/validation.ts`, `assertIdentityVerified` |
| **Self-exclusion circumvention** | `assertNotSelfExcluded` runs server-side on every wagering and deposit endpoint; the session store returns the *current* user row so an exclusion applies on the next request, not the next login. Withdrawals are deliberately not blocked. | `src/server/auth/guard.ts`, `src/server/auth/session.ts` |
| **Bonus abuse / multi-accounting** | Structural only in this build: one wallet per user, a promotion eligibility model, and an audit trail keyed by hashed IP and device so linked accounts are detectable. Real detection needs device fingerprinting, payment-instrument matching and manual review. | `prisma/schema.prisma`, `src/server/security/audit.ts` |
| **Odds scraping** | `search` and `api` policies bound read volume per key; the public feed is served through `src/services/**` so caching and per-key quotas attach in one place. | `src/server/security/rateLimit.ts` |
| **Arbitrage / late betting** | The server prices at acceptance, not at render; markets carry a suspension state that is re-read at placement time; a moved price voids the slip unless the player accepted movement. | `betPlacementSchema`, placement handler |
| **Chargeback fraud** | Deposits and withdrawals go through a PSP adapter that refuses in demo mode. SportGo never receives card data — hosted fields or redirect only, so no PAN or CVV enters this codebase or its logs. | `src/types/wallet.ts`, `src/server/security/audit.ts` |
| **Insider odds manipulation** | Roles are explicit and not hierarchical: `requireRole` never grants `trader` to an `admin` implicitly. `admin.odds_overridden` and `admin.bet_settled_manually` are first-class audit actions. Production requires four-eyes approval on both. | `src/server/auth/guard.ts`, `src/server/security/audit.ts` |
| **Mass assignment** | Zod schemas describe exactly the accepted fields; anything else is dropped before a handler sees it. No request body is spread into a record. | `src/lib/validation.ts` |
| **IDOR** | Every account-scoped query filters on the session user id, never on an id from the request. An admin route reaching another user's data is `requireAdmin` plus an `admin.user_viewed` audit entry. | route handlers |
| **Injection** | Prisma parameterises every query; `listQuerySchema` bounds `sort` to an identifier shape and the call site allow-lists the column. | `prisma/`, `src/lib/validation.ts` |
| **PII leaking into logs** | `redact()` strips anything keyed like a secret, hashes emails, masks phone numbers, truncates strings and bounds depth. IPs are salted-hashed before they become a rate-limit key or an audit field. | `src/server/security/audit.ts`, `sanitize.ts` |
| **Misconfiguration reaching production** | `env.ts` parses the environment at boot and refuses to start `APP_MODE=live` without a licence, a KYC provider, a payment provider, a self-exclusion register and a real (non-`mock`) feed. | `src/server/env.ts` |

---

## 3. The request pipeline

Every route under `src/app/api/**` is wrapped by `withRoute` in
`src/server/api.ts`. The order is load-bearing:

```
rate limit  →  read body once  →  CSRF  →  auth guard  →  zod  →  handler  →  audit
```

- **Rate limit first** — the cheapest rejection, and the one protecting
  everything behind it.
- **CSRF before auth** — a forged cross-site request is refused without
  touching the session store.
- **Validation after auth** — an anonymous caller cannot use field-level
  validation errors as an oracle for the shape of an internal model.
- **One error path.** Handlers throw; `handleRouteError` decides the status.
  `error.message` never reaches the client: the full (redacted) error goes to
  the audit trail and the caller gets one i18n key. The difference between "no
  such column" and "no such user" is precisely what is being probed for.

Responses are `no-store` by default. A player's balance must never sit in a
shared cache.

---

## 4. Secrets and data handling

- Secrets are read once, in `src/server/env.ts`, which throws if imported into a
  client bundle. Only `NEXT_PUBLIC_*` values are exposed, and only through
  `src/config/app.config.ts`.
- No secret in this repository is a working credential. `.env.example` is a
  template.
- IP addresses and email addresses are salted-hashed (`PII_HASH_SALT`) before
  they reach a log, a rate-limit key or an audit record. An unsalted hash of an
  IPv4 address is pseudonymisation in name only — the space is small enough to
  enumerate.
- `KycRecord` holds a provider reference and a status. No identity documents, no
  ID numbers. `Transaction` holds a provider token and a masked label. No PAN,
  no CVV, no clear IBAN.

---

## 5. Content-Security-Policy

Generated per request in `middleware.ts` because it carries a nonce:

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

Development adds `'unsafe-eval'` (React Refresh compiles in the browser) and
`ws:` (HMR), and drops `upgrade-insecure-requests` so `http://localhost` still
loads. Neither concession is reachable in a production build.

`style-src 'unsafe-inline'` is a known, accepted gap: `next/font` and the
critical CSS both emit inline `<style>`. Closing it means hashing every inline
style at build time.

---

## 6. Not implemented in this build

This list is exhaustive by intent. Anything here is a boundary with a refusing
implementation, not a working control.

- **Password hashing.** `createHasher()` throws. No Argon2 or bcrypt binding is
  installed, and no weak fallback ships in its place.
- **Persistent sessions.** The session store is an in-process `Map`. It does not
  survive a restart and is not shared between instances.
- **A user database.** `src/server/db.ts` builds a Prisma client lazily against
  a schema that nothing in this build reads or writes.
- **Age and identity verification.** No provider. `kycStatus` is always
  `not_started`; `assertIdentityVerified` therefore always refuses.
- **Payments.** No PSP. Deposit and withdrawal routes return
  `demo_mode_blocked`.
- **Wager placement and settlement.** No pricing engine, no ledger write.
- **National self-exclusion register.** No integration in either direction.
- **Two-factor authentication.** `User.twoFactorEnabled` exists in the model;
  no enrolment or verification flow does.
- **Distributed rate limiting.** The limiter is per-process, so N instances
  behind a load balancer allow N × limit. A Redis implementation of the
  `RateLimiter` interface is the only change required.
- **A tamper-evident audit store.** The sink writes structured JSON to stdout.
- **Anti-fraud, device fingerprinting, velocity rules, sanctions screening.**
- **Automated dependency, secret and container scanning; penetration testing.**

---

## 7. Before `APP_MODE=live`

`env.ts` refuses to boot in live mode without the provider configuration, and
`compliance.requiredBeforeLaunch` in `src/config/app.config.ts` lists the
regulatory gates. Beyond those, the security work that must be finished:

1. Argon2id hashing, with a documented rehash-on-login path.
2. Sessions and audit records in Postgres; audit rows append-only, hash-chained,
   shipped off-host in near real time, retained for the licence period.
3. Redis-backed rate limiting, plus per-account limits alongside the per-IP ones
   — password spraying is invisible to a per-account counter alone.
4. Four-eyes approval and independent audit review on odds overrides, manual
   settlement, balance adjustments and role changes.
5. Trusted-proxy configuration for `clientIp`: `x-forwarded-for` is client-
   controlled until an edge you control overwrites it.
6. A vulnerability-disclosure policy and a named security contact.
