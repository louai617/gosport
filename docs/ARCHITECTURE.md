# SportGo — Architecture

> **Status: demonstration build.** No real money, no real odds feed, no payment
> provider, no identity verification, no gambling licence. Every regulated
> capability is present as a typed boundary with a refusing implementation, so
> a licensed operator can replace the adapter without touching feature code.

---

## 1. Guiding decisions

| Decision | Choice | Why |
|---|---|---|
| Rendering | Next.js 16 App Router, **RSC-first** | The sportsbook is read-heavy. Event lists, competition pages and results render on the server with zero client JS; only odds buttons, the bet slip and overlays are client components. |
| Styling | Tailwind v4, **CSS-first `@theme`** | One token file (`globals.css`) is the whole design system. No `tailwind.config.js`, no runtime CSS-in-JS, no theme provider. |
| State | zustand for the bet slip, URL for everything else | Filters, pages and tabs live in the query string so pages stay shareable and server-renderable. Only genuinely cross-page ephemeral state (the slip) needs a store. |
| Data | Service layer over a swappable provider | Components never import `@/data`. `src/services/*` is the seam a real feed slots into. |
| i18n | Custom flat-key dictionary, cookie-scoped locale | Namespaced JSON, server-loaded, only the active locale ships. Routes stay clean (`/sports/football`, not `/fr/sports/football`). |
| Money | `Decimal(18,3)` in the schema; never a float | TND is a **three**-decimal currency. Display rounds to 2; the ledger does not. |
| Auth | Opaque token + server session record | The session table stores a SHA-256 hash of the token, never the token. |

### The one i18n trade-off worth naming
Locale is held in a cookie rather than a URL segment. This keeps every route
free of a `[locale]` param — which matters when many pages are written in
parallel — at the cost of per-locale SEO. `src/i18n/config.ts` is the only file
that would change to move to `/[locale]/…`: add the segment, read `params.locale`
instead of the cookie in `getRequestLocale()`. Nothing else in the app reads
locale directly.

---

## 2. Layer map

```
┌──────────────────────────────────────────────────────────────────────┐
│  app/            Routes, layouts, loading/error boundaries           │
│                  Server Components by default                        │
├──────────────────────────────────────────────────────────────────────┤
│  components/     Presentational + interactive UI. No data fetching   │
│                  beyond props. ui/ = primitives, rest = domain.      │
├──────────────────────────────────────────────────────────────────────┤
│  services/       ◄── THE SEAM. Async API over the data provider.     │
│                  Swap the internals for HTTP and nothing above moves.│
├──────────────────────────────────────────────────────────────────────┤
│  data/           Deterministic mock dataset (seeded PRNG).           │
│                  Replaced wholesale by a real feed client.           │
├──────────────────────────────────────────────────────────────────────┤
│  server/         Route toolkit, auth, sessions, rate limiting, CSRF, │
│                  audit, env parsing, Prisma client. Server-only.     │
├──────────────────────────────────────────────────────────────────────┤
│  lib/  types/  config/  i18n/  store/    Cross-cutting, no I/O       │
└──────────────────────────────────────────────────────────────────────┘
```

**Dependency rule (enforced by review):** arrows point downward only.
`components/` may import `services/`, `lib/`, `types/`, `i18n/`, `store/`,
`config/`. `components/` may **never** import `data/` or `server/`.

---

## 3. Folder structure

```
sportgo/
├─ prisma/schema.prisma
├─ middleware.ts                    CSP + nonce + request id
├─ locales/{en,fr,ar}/*.json        one file per namespace, flat keys
├─ docs/                            CONTRACT · ARCHITECTURE · SECURITY
│                                   DATABASE · BRAND · COMPLIANCE
├─ public/                          favicon.svg · logo.svg
└─ src/
   ├─ app/
   │  ├─ layout.tsx  providers.tsx  globals.css
   │  ├─ (shell)/                   public sportsbook — header/nav/footer
   │  │  ├─ layout.tsx
   │  │  ├─ page.tsx                     /
   │  │  ├─ sports/page.tsx              /sports
   │  │  ├─ sports/[sport]/page.tsx      /sports/football
   │  │  ├─ live/page.tsx                /live
   │  │  ├─ event/[id]/page.tsx          /event/:id
   │  │  ├─ results/page.tsx             /results
   │  │  ├─ promotions/…                 /promotions, /promotions/[slug]
   │  │  ├─ responsible-gambling/page.tsx
   │  │  ├─ search/page.tsx
   │  │  └─ legal/{terms,privacy,cookies,help,contact}/page.tsx
   │  ├─ (auth)/{login,register,forgot-password}/page.tsx
   │  ├─ (account)/
   │  │  ├─ layout.tsx                   account chrome + section nav
   │  │  ├─ account/…                    overview · bets · profile ·
   │  │  │                               security · responsible · notifications
   │  │  └─ wallet/…                     wallet · deposit · withdraw · history
   │  ├─ admin/                          separate chrome, own layout
   │  │  ├─ layout.tsx  page.tsx
   │  │  └─ {users,events,sports,competitions,bets,transactions,
   │  │      promotions,reports,responsible-gambling,settings}/
   │  └─ api/                            see §7
   ├─ components/
   │  ├─ ui/          30 primitives (Button…ScrollFade)
   │  ├─ brand/       Logo · LogoMark · TeamCrest · CompetitionCrest
   │  ├─ layout/      Header · Footer · Shell · DemoBanner · MobileNav
   │  ├─ navigation/  SportsNav · SportChip · Breadcrumbs · SectionNav
   │  ├─ sports/      SportCard · SportIcon · CompetitionCard · CountryGroup
   │  ├─ matches/     MatchCard · LiveMatchCard · FeaturedEventCard ·
   │  │               MatchList · ScoreBoard · Countdown · LiveIndicator
   │  ├─ betting/     OddsButton · MarketGroup · BetSlip · BetSlipItem ·
   │  │               StakeInput · BetSlipTrigger · BetSlipSheet
   │  ├─ account/     BalanceCard · BetHistoryTable · StatTile · LimitControl
   │  ├─ wallet/      PaymentMethod · DepositForm · WithdrawalForm ·
   │  │               TransactionHistory
   │  ├─ promotions/  PromotionCard · PromotionDetail
   │  ├─ auth/        AuthShell · LoginForm · RegisterForm · AgeGate
   │  ├─ notifications/ NotificationDropdown · NotificationItem
   │  ├─ search/      GlobalSearch · SearchResults
   │  ├─ admin/       AdminShell · DataTable · StatCard · EventForm
   │  └─ compliance/  DemoBadgeStrip · AgeWarning · ResponsibleFooterNote
   ├─ services/   sports · odds · user · payment · promotions · admin
   ├─ data/       rng · catalog · fixtures · account · promotions ·
   │              payments · dataset · index
   ├─ server/     api · env · db · auth/* · security/*
   ├─ store/      betSlipStore · uiStore
   ├─ lib/        cn · format · betting · validation
   ├─ i18n/       config · namespaces · dictionaries · translate ·
   │              server · I18nProvider
   ├─ types/      sports · betting · user · wallet · promotions · api
   └─ config/     app.config.ts   ◄── currency · locale · timezone ·
                                       legalAge · jurisdiction · compliance
```

---

## 4. Database architecture

24 models. Full ERD and rationale in `docs/DATABASE.md`. The spine:

```
User ──1:1── Wallet ──1:N── Transaction        (append-only ledger)
 │                              ▲
 ├──1:N── Session               │ bet_stake / bet_payout
 ├──1:N── Bet ──1:N── BetSelection ──N:1── Selection ──N:1── Market ──N:1── Event
 ├──1:N── Favorite                                                        │
 ├──1:N── Notification                              Sport ──1:N── Competition ──1:N── Event
 ├──1:N── ResponsibleGamblingLimit                  Country ──1:N── Competition
 ├──1:N── SelfExclusion                             Team ──N:N── Event (home/away)
 ├──1:1── KycRecord            (provider ref only — no documents, no ID numbers)
 └──1:N── AuditLog             (append-only, tamper-evident in production)
```

Non-negotiables baked into the schema:

- **Money is `Decimal(18,3)`.** Never `Float`, never `Int` cents — TND has
  three minor digits.
- **Balance is derived from the ledger**, not mutated in place. Settlement is
  one transaction: lock the wallet row, insert the ledger entry, update the bet.
- **Sessions store a token hash**, never the token.
- **`KycRecord` stores no documents and no ID numbers** — a provider reference
  and a status. The images stay with the verification provider.
- **`Transaction` stores no PAN, no CVV, no clear IBAN** — a provider token and
  a display-safe masked label.
- `ResponsibleGamblingLimit` carries `pendingValue` / `pendingEffectiveFrom`
  because **a limit increase must be delayed and a decrease must be immediate**.
- `SelfExclusion.endsAt` is nullable (indefinite) and carries an
  `externalRegisterRef` for the national register that a licensee must join.

---

## 5. Component hierarchy

```
RootLayout  (html lang/dir · fonts · I18nProvider · ToastProvider)
│
├─ (shell)/layout
│   ├─ DemoBanner              ── site-wide, dismissible, states what is simulated
│   ├─ Header                  ── sticky 60px, .glass
│   │   ├─ Logo                   MobileNav trigger
│   │   ├─ PrimaryNav             Sports · Live · Popular · Promotions · Results
│   │   ├─ GlobalSearch           ⌘K, autocomplete over teams/comps/sports/players
│   │   └─ LanguageSelector · HelpMenu · NotificationDropdown · Auth CTAs
│   ├─ SportsNav               ── horizontal scroller, football active by default
│   ├─ {page}
│   └─ Footer                  ── 18+ · responsible gambling · legal · no licence
│
├─ Homepage
│   ├─ FeaturedEventCard       ── hero: competition · crests · countdown · 1 X 2
│   │                             + Over/Under · BTTS · Double Chance
│   ├─ LiveSection → LiveMatchCard[]    score · timer · pulse · markets · stats
│   ├─ UpcomingSection → MatchCard[]    grouped by day
│   ├─ PopularCompetitions → CompetitionCard[]
│   ├─ PromoStrip → PromotionCard[]
│   └─ ResponsibleGamblingNote
│
├─ Sportsbook page  (3 columns: 260 | 1fr | 340)
│   ├─ SportsSidebar           Sports · Competitions · Countries · Favourites
│   ├─ CompetitionSection[]    → MatchRow[] → MarketGroup → OddsButton
│   └─ BetSlipPanel            sticky
│
└─ BetSlip  (one store, three surfaces)
    ├─ desktop  BetSlipPanel        sticky right rail
    ├─ mobile   BetSlipTrigger      floating "Bet Slip (3)"
    │           BetSlipSheet        bottom sheet
    └─ shared   SegmentedControl (Single|Multiple|System)
                BetSlipItem[] · StakeInput · SlipSummary · AuthCta
```

`OddsButton` is the atom the whole product turns on: it appears in the hero, in
live cards, in match rows and in search results, and every instance goes through
the same `useBetSlipStore().toggle()`. Selected state is `aria-pressed`, price
movement animates via `animate-odds-up` / `animate-odds-down`, and the
accessible name reads *"Espérance to win, odds 1.75, Espérance vs Club Africain"*
— not "1.75".

---

## 6. Design system

Tokens live in `src/app/globals.css` under `@theme`. Nothing hard-codes a hex.

**Colour** — one blue, used deliberately; semantics restrained.

| Role | Token | Value |
|---|---|---|
| Page ground | `canvas` / `canvas-soft` | `#070b16` / `#0a1020` |
| Card | `surface` / `-2` / `-3` | `#0e1527` / `#141d33` / `#1b2643` |
| Hairline | `line` / `-soft` / `-strong` | `#1e2a45` / `#172037` / `#2c3b5e` |
| Text | `ink` / `-muted` / `-subtle` | `#f4f7fc` / `#9aabc9` / `#6b7c9c` |
| Brand | `primary` (+hover/active/soft) | `#3b74ff` |
| Live | `live` | `#ff4d5e` |
| Success / Warning / Danger / Info | | `#2fbf71` / `#e0a339` / `#e2565c` / `#4d8dff` |

**Type** — Inter (Latin) + Noto Sans Arabic, `display / h1 / h2 / h3 / body /
small / caption`, negative tracking on headings, tabular numerals on every odds,
score and money figure via `.numeric`.

**Radii** 4→20px · **Elevation** four soft dark shadows, never coloured ·
**Motion** 120/180/280ms with `ease-out-quint`, plus `ease-spring` for the
"added to slip" pop. Everything collapses under `prefers-reduced-motion`.

**Restraint rules** (in `docs/CONTRACT.md`, checked in review): one accent per
screen · at most one gradient surface per viewport · glass only on the sticky
header, the mobile slip bar and drawers · no neon · no `rounded-full` except
avatars, pills and dots.

**RTL** is structural, not a mirror hack: logical properties everywhere
(`ms/me/ps/pe/start/end`), `.flip-rtl` on directional icons, and scores/odds
pinned to `dir="ltr"` so `1 — 0` never reverses.

---

## 7. Page map

| Route | Purpose |
|---|---|
| `/` | Dashboard: hero · live · upcoming · popular · promos · RG note |
| `/sports` · `/sports/[sport]` | 3-column sportsbook, reusable per sport |
| `/live` | Live-only board with auto-updating simulated prices |
| `/event/[id]` | Full market list for one event |
| `/results` | Completed matches, filtered by sport / date / competition |
| `/promotions` · `/promotions/[slug]` | Offer cards + terms & eligibility |
| `/responsible-gambling` | 18+ · limits · session · cooling-off · self-exclusion · support |
| `/search` | Global search results |
| `/login` · `/register` · `/forgot-password` | Auth, with an explicit 18+ self-declaration that is **not** verification |
| `/account` | Overview · balance · open bets · total bets · recent activity |
| `/account/bets` · `/open` · `/history` | Bet tables: date · event · selection · odds · stake · return · status |
| `/account/transactions` · `/profile` · `/security` · `/responsible` · `/notifications` | |
| `/wallet` · `/deposit` · `/withdraw` · `/history` | Provider-abstracted, refuses in demo mode |
| `/admin` + 10 sections | Operator console: stats, tables with search/filter/sort/pagination, event & promotion management |
| `/legal/{terms,privacy,cookies}` · `/help` · `/contact` | |

### API surface (`src/app/api/**`) — all returning `ApiResponse<T>` with `meta.mode`

```
GET  /api/sports                GET  /api/competitions      GET  /api/events
GET  /api/events/:id            GET  /api/odds              GET  /api/results
GET  /api/search
POST /api/auth/register | login | logout     GET /api/account
GET  /api/bets                  GET  /api/transactions
GET  /api/wallet                POST /api/wallet/deposit | withdraw   ← refuse in demo
```

Every route goes through `withRoute()`: zod validation → rate limit → auth
guard → CSRF on unsafe methods → handler → audit → sanitised error envelope.
Anything that would move money or place a wager returns `demo_mode_blocked`.

---

## 8. Build status

| Stage | Content | |
|---|---|---|
| 0 | Scaffold, tsconfig, CSP middleware, env template | ✅ |
| 1 | Design tokens, domain types, app config, i18n core, bet-slip store, format/betting libs | ✅ |
| 2 | 30 UI primitives · deterministic dataset · service layer · Prisma schema · security layer · brand mark | ✅ |
| 3 | Shell (header, sports nav, footer, mobile drawer, demo banner) · homepage · match & betting components · bet slip | ✅ |
| 4 | Sports · sport pages · event page · live · competition · results · search · popular | ✅ |
| 5 | Auth (login, register, forgot) · account (8 sections) · wallet (4) | ✅ |
| 6 | Promotions · responsible gambling · legal · help · contact · about | ✅ |
| 7 | Admin console (11 sections) | ✅ |
| 8 | 16 API routes behind `withRoute` | ✅ |
| 9 | Typecheck, build, route smoke test | ✅ |
| 10 | Browser verification: mobile / tablet / desktop × FR / AR-RTL / EN | ✅ |
| 11 | Accessibility and overflow pass | ✅ |
| 12 | Casino games: 5 provably-fair originals, provider adapter, verifier, lobby, admin | ✅ |

## 9. Verification

```bash
npm run verify   # typecheck → translation audit → production build
npm run smoke    # request all 59 routes against a running dev server
```

**`scripts/audit-i18n.mjs`** checks two things a type system cannot: that every
literal `t("…")` key in `src/` exists in the merged dictionary, and that all
three locales carry the same key set *and* the same `{placeholders}` per key —
a translator dropping `{count}` breaks a sentence silently.

**`scripts/smoke.sh`** requests every route. This matters more than it sounds:
every page here is dynamic, so `next build` never renders one, and a runtime
failure in a server component compiles perfectly and 500s on request. It caught
exactly that — an admin page importing `parseListQuery` from a `"use client"`
module, which typechecked, built, and then threw on every request. The error
boundary carries a `data-error-boundary` marker because a rendered boundary
still returns 200; the status code alone cannot tell a broken page from a good one.

### Two bugs the build could not catch

Both typechecked, built clean, and failed only at request time. Each now has a
script that fails loudly instead.

**1. Server modules calling `"use client"` exports.** `parseListQuery` and
`hasBoard` were exported from client component files and called from server
pages. React replaces those with a proxy that throws on call. Every page here
is dynamic, so `next build` renders none of them and never hits it.
→ `npm run check:boundary`, verified to fire on a planted violation.

**2. The proxy was in the wrong directory, so no CSP was ever sent.**
`middleware.ts` sat at the repo root. Next resolves it inside `src/` when a
`src/` directory exists — and Next 16 renamed it to `proxy.ts`. The build even
printed `ƒ Proxy (Middleware)`, every page returned 200, and the security layer
looked complete while sending **no Content-Security-Policy and no request id at
all**. A missing security header is invisible unless something asserts on it.
→ `npm run smoke` now asserts CSP, its nonce, and `x-request-id`, verified to
fire when the proxy is removed.

### Known gaps

- No test suite. `lib/betting.ts` and `lib/validation.ts` are pure and are the
  obvious first targets.
- Favourites and notification read-state are client-local; they need the
  service layer and revalidation to persist.
- The odds simulator drifts prices on a timer. A real feed is a socket, and
  `oddsService.subscribeToOddsUpdates` is the seam it replaces.
- Casino rounds are computed in the browser against a session balance.
  `gamesService.placeRound()` refuses on purpose — see `docs/GAMES.md`.
- Provably fair is arithmetically real but guarantees nothing without a server
  holding the seed. Both the fairness panel and `/games/fairness` say so.
