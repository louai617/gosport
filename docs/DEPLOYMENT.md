# SportGo — local development and deployment

## 1. Local development

Requires Node 22+ (developed on Node 26). No Docker and no database server: local
development uses a SQLite file.

```bash
npm install                      # also runs prisma generate for the right engine
cp .env.example .env.local
```

Edit `.env.local` — at minimum:

```bash
DATABASE_URL="file:./dev.db"
SESSION_SECRET="$(openssl rand -base64 48)"     # paste the value
PII_HASH_SALT="$(openssl rand -base64 24)"      # paste the value
ADMIN_EMAIL="you@example.com"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="<a password you choose, ≥10 chars, mixed>"
```

Then:

```bash
npm run db:deploy                # create dev.db and apply migrations
npm run db:seed                  # create the first administrator from ADMIN_*
npm run dev                      # http://localhost:3000
```

Sign in at `/login` with `ADMIN_EMAIL` and `ADMIN_PASSWORD`; you are required to
change the password before anything else. Remove `ADMIN_PASSWORD` from
`.env.local` afterwards — it is only read by the seed. Players register at
`/register`; an administrator credits them from **Admin → Wallet** (or the player's
detail page).

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js development server / production build / serve the build |
| `npm run typecheck`, `lint` | `tsc --noEmit`, ESLint |
| `npm run test:unit` | Settlement, period, CSV and fairness tests (no server needed) |
| `npm run test:integration` | End-to-end API and database suite — needs a running server (`npm run dev` or `npm start`); creates its own users |
| `npm run verify` | Typecheck → client-boundary check → i18n audit → unit tests → production build |
| `npm run db:deploy` / `db:migrate` / `db:seed` / `db:studio` | Migrations (apply / create), seed, browse data |
| `npm run admin:recovery-link -- <email>` | Break-glass: print a single-use, 30-minute password-reset link for an administrator |
| `npm run slot:rtp` | Recompute the slot's RTP by enumeration |

Resetting the local database: stop the dev server, delete `dev.db*`, rerun
`db:deploy` and `db:seed`, **restart the server** (it holds the file open; a stale
handle makes the database-backed rate limiter fail closed with HTTP 429).

## 2. Production database: PostgreSQL

SQLite is refused on Vercel. Provision any PostgreSQL 14+ (Vercel Postgres/Neon,
Supabase, RDS, …) and take its connection string.

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require` — the **pooled** URL if your provider offers one |
| `DIRECT_URL` | *(only behind a transaction pooler)* the provider's **direct** URL; used by migrations only, because they take advisory locks a pooler cannot proxy |
| `DATABASE_POOL_MAX` | Connections per server instance, e.g. `3`–`5` on serverless |

The scheme of `DATABASE_URL` selects the engine, the migrations folder
(`prisma/migrations/postgresql`) and the driver automatically.

## 3. Deploying to Vercel

1. **Push the repository** to GitHub/GitLab/Bitbucket and **Import Project** in
   Vercel. The framework is detected; `vercel.json` sets the build command to
   `npm run build:vercel`, which generates the client for PostgreSQL, runs
   `prisma migrate deploy` (forward-only, never resets data) and then `next build`.
2. **Set environment variables** (Project → Settings → Environment Variables), one
   set **per environment**:

   | Variable | Production | Preview | Development |
   |---|---|---|---|
   | `DATABASE_URL` | production DB | **a separate** DB | a separate DB (or local `file:`) |
   | `DIRECT_URL` | if pooled | if pooled | – |
   | `SESSION_SECRET` | unique 48-byte secret | unique | unique |
   | `PII_HASH_SALT` | unique secret | unique | unique |
   | `NEXT_PUBLIC_APP_URL` | `https://your-domain` | preview URL | `http://localhost:3000` |
   | `DATABASE_POOL_MAX` | `5` | `3` | – |

   Mark secrets **Sensitive**. **Do not point Preview at the production database**:
   every preview build runs `migrate deploy`, and preview users would share
   production accounts. Do **not** set `ADMIN_*` in Vercel.
3. **Deploy.** The build fails loudly if `DATABASE_URL` is missing, and the app
   refuses to start sessions without `SESSION_SECRET` when running on Vercel.
4. **Create the first administrator** once, from your own machine against the
   production database (use `DIRECT_URL` if pooled). Nothing is ever stored in the
   repository or in Vercel:

   ```bash
   export DATABASE_URL='postgresql://…'            # production, direct connection
   export ADMIN_EMAIL='you@example.com' ADMIN_USERNAME='admin'
   ADMIN_PASSWORD="$(openssl rand -base64 24)Aa1" npm run db:seed   # throw-away, never shown
   npm run admin:recovery-link -- you@example.com  # prints a 30-minute link: set your own password
   ```

   Open the printed link, choose your password, and sign in at `/login`. The seed
   never overwrites an existing account, so it is safe to re-run.
5. **Smoke-test** the deployment: sign in as admin, create a player from
   **Admin → Players → New**, credit them, sign in as that player in a private
   window, place a sportsbook bet and a casino round, then check **Admin → Audit**.
6. **Add your domain** and set `NEXT_PUBLIC_APP_URL` to it (reset links are built
   from it). HSTS is sent with `preload`; only add the domain to a preload list
   when you are sure about HTTPS everywhere.

### Operating notes

- **Rotating `SESSION_SECRET`** signs everyone out and invalidates outstanding
  reset links. Rotating `PII_HASH_SALT` only resets rate-limit buckets.
- **Locked-out administrator:** `npm run admin:recovery-link -- <email>` with
  production `DATABASE_URL` in the environment. Whoever can run this already holds
  the database credentials, which is the trust boundary.
- **E-mail:** there is no e-mail transport. Password-reset and invitation links
  are generated by an administrator (player page → "Create password-reset link", or
  an invitation when creating the player) and shown once, to be delivered through
  a channel you trust. To send them automatically, implement `MessageTransport` and
  call `setMessageTransport` once at boot (`src/server/notifications/transport.ts`);
  a console transport exists for development only and is never installed in
  production.
- **Backups:** the ledger and audit log live only in this database. Enable
  point-in-time recovery at your provider and test a restore.
- **Server actions and a custom domain/proxy:** Next.js rejects a server action
  whose `Origin` differs from `Host`. On Vercel this just works; behind another
  proxy that rewrites `Host`, add the public hostname to
  `experimental.serverActions.allowedOrigins` in `next.config.ts`.
- **Rate limiting:** authentication and money policies are database-backed and
  correct across instances; the remaining policies are per-instance memory (see
  `SECURITY.md` §4).
- **Cron / background work:** none is required; expired crash rounds are settled
  lazily the next time the player (or `/api/casino/active`) touches them.

## 4. What this deployment is — and is not

This is a platform running on **demo credits**. There is no payment provider
(deposits are recorded by an administrator; withdrawals are paid out by the
operator out of band and then marked completed), no e-mail transport, no
automated KYC (the verification status is a manual operator decision), no
two-factor authentication, and **no gambling licence** is held or claimed. Do not
accept real money with it. `docs/COMPLIANCE.md` lists what must exist first.
