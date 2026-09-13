# SportGo — build contract

Read this file before writing any code. It is the shared agreement every part
of the codebase is written against. Do not restate it in code comments; just
follow it.

---

## 0. Non-negotiables

1. **Demo mode.** Nothing in this build takes real money, places a real wager,
   verifies a real identity or calls a real payment provider. Any surface that
   shows odds, a balance, a bet or a transaction must make the simulation
   obvious (a `SimulatedBadge`, a note, or a section-level disclaimer).
2. **No fake credentials, no fake licence numbers, no fake regulator names.**
   `compliance.licence` in `src/config/app.config.ts` is `null` and stays null.
3. **No claim of legal authorisation.** Never write copy asserting SportGo is
   licensed in Tunisia or anywhere else.
4. **Original design.** Do not reproduce another sportsbook's layout, logo,
   colour system or component design. Do not use real club crests or league
   logos — use the generated placeholder crest component.
5. **No hard-coded user-facing strings.** Every visible string goes through
   `t("namespace.key")`. Proper nouns (team names, competition names) come from
   data and are rendered as-is.

## 1. Stack

Next.js 16 App Router · React 19 · TypeScript (strict) · Tailwind CSS v4
(CSS-first `@theme`, no `tailwind.config.js`) · zustand · zod.
Icons: `lucide-react`. No other UI or animation library — animation is CSS.

Server Components by default. Add `"use client"` only where state, effects,
browser APIs or event handlers are genuinely needed. Keep client boundaries
low in the tree.

## 2. Paths

`@/*` → `src/*` · `@locales/*` → `locales/*`

## 3. Design tokens

Defined in `src/app/globals.css` under `@theme`. Use the Tailwind utilities
they generate. **Never** use a raw hex value or a stock Tailwind palette colour
(`bg-slate-900`, `text-gray-400`, `bg-blue-500` …).

| Purpose | Utility |
|---|---|
| Page ground | `bg-canvas`, `bg-canvas-soft` |
| Card | `bg-surface`, `bg-surface-2` (hover/nested), `bg-surface-3` (pressed/selected) |
| Hairlines | `border-line`, `border-line-soft`, `border-line-strong` |
| Text | `text-ink`, `text-ink-muted`, `text-ink-subtle`, `text-ink-inverse` |
| Brand | `bg-primary`, `hover:bg-primary-hover`, `bg-primary-soft`, `text-primary` |
| Live | `text-live`, `bg-live`, `bg-live-soft` |
| Semantic | `success`, `warning`, `danger`, `info` (+ `-soft` variants) |
| Type scale | `text-display`, `text-h1`, `text-h2`, `text-h3`, `text-body`, `text-small`, `text-caption` |
| Radii | `rounded-xs sm md lg xl 2xl` (4→20px). Cards use `rounded-lg`/`rounded-xl`. Never `rounded-full` except avatars, pills and dots. |
| Elevation | `shadow-e1` … `shadow-e4` |
| Motion | `duration-fast/base/slow`, `ease-out-quint`, `ease-spring` |

Helper classes available: `.glass`, `.glass-panel`, `.gradient-hero`,
`.gradient-panel`, `.edge-light`, `.scroll-x`, `.scroll-slim`, `.mask-fade-x`,
`.skeleton`, `.numeric`, `.flip-rtl`, `.safe-bottom`, `.sr-only-focusable`.

Animations: `animate-live-pulse`, `animate-slide-up`, `animate-slide-in-end`,
`animate-fade-in`, `animate-pop`, `animate-odds-up`, `animate-odds-down`,
`animate-shimmer`.

**Restraint rules.** One accent per screen. No neon. No more than one gradient
surface per viewport. Shadows are soft and dark, never coloured. Glass only on
the sticky header, the mobile slip bar and drawers.

### Numerals
Any element rendering odds, money, scores, counts or times gets `className="numeric"`.

## 4. RTL

Arabic is a first-class direction, not a mirror hack.

- **Always** use logical properties: `ms-*`, `me-*`, `ps-*`, `pe-*`,
  `start-*`, `end-*`, `text-start`, `text-end`, `border-s`, `border-e`,
  `rounded-s-*`, `rounded-e-*`.
- **Never** use `ml-*`, `mr-*`, `pl-*`, `pr-*`, `left-*`, `right-*`,
  `text-left`, `text-right` for layout that should flip.
- Directional icons (chevrons, arrows) get `className="flip-rtl"`.
- Scores, odds and clock values are **not** mirrored — a `1 — 0` stays `1 — 0`.
  Wrap score/odds rows in `dir="ltr"` when they sit inside RTL text.
- `flex-row` flips automatically; do not add `flex-row-reverse` for RTL.

## 5. i18n

```tsx
"use client";
import { useT } from "@/i18n/I18nProvider";
const t = useT();
t("home.hero.title");
t("betslip.selectionCount", { count: 3 });
```

Server components:
```tsx
import { getT } from "@/i18n/server";
const t = await getT();
```

Keys are flat dotted paths. Placeholders are `{name}`.

**Namespace ownership** — write to your namespace only, in all three locales:
`locales/en/<ns>.json`, `locales/fr/<ns>.json`, `locales/ar/<ns>.json`.
Namespaces: `common`, `home`, `sportsbook`, `betting`, `auth`, `account`,
`wallet`, `promotions`, `responsible`, `admin`.

French is the default locale for this market. Arabic must be real Modern
Standard Arabic, not transliteration. Keep Arabic strings tight — Arabic runs
longer than French; avoid long labels inside narrow chips.

## 6. Formatting

Never call `Intl` directly in a component. Use `src/lib/format.ts`:
`formatAmount`, `formatNumber`, `formatOdds`, `formatDateTime`, `formatTime`,
`formatDate`, `relativeDay`, `countdownParts`, `pad2`, `formatPhone`,
`initialsOf`. All take an explicit `locale` from `useI18n()`.

Odds always render via `formatOdds` → two decimals.

## 7. Data access

Components never import from `src/data/**`. They go through `src/services/**`,
which is the seam a real feed provider slots into later.

## 8. Bet slip

Any odds button anywhere uses the shared store:

```tsx
import { useBetSlipStore } from "@/store/betSlipStore";
const toggle = useBetSlipStore((s) => s.toggle);
const isSelected = useBetSlipStore((s) => s.has(selection.id));
```

`toggle` takes `Omit<BetSlipItem, "stake" | "addedAt">`.

## 9. Accessibility

- Semantic HTML first; `div` with a click handler is a bug.
- Every icon-only control has `aria-label`; decorative icons get `aria-hidden`.
- Odds buttons: `aria-pressed` for selected state, and an `aria-label` that
  reads "`{team} to win`, odds `{value}`, `{event}`" — not just the number.
- Dialogs/drawers: `role="dialog"` `aria-modal="true"`, labelled, focus trapped,
  Escape closes, focus returns to the trigger.
- Live regions: the bet-slip count and odds changes announce via
  `aria-live="polite"`.
- Focus is always visible — never remove the outline without replacing it.
- Contrast: body text on `bg-surface` must clear 4.5:1; `text-ink-subtle` is
  for ≥14px non-essential text only.
- Respect `prefers-reduced-motion` (already handled globally in `globals.css`).

## 10. States

Every list, table and panel must handle: **loading** (skeleton, matching the
real layout), **empty** (icon + one line + optional action), **error**
(message + retry). Use `Skeleton` and `EmptyState` from `@/components/ui`.

## 11. File conventions

- One component per file, `PascalCase.tsx`, named export **and** default where
  it is a page.
- Props interfaces are named `<Component>Props` and exported.
- No `any`. No non-null `!` unless provably safe with a comment.
- Comments explain *why*, not *what*. Do not narrate obvious code.
- No `console.log` in committed code.

## 12. Layout geometry

- Shell max width: `max-w-[1440px]` centred, `px-4 sm:px-6 lg:px-8`.
- Desktop sportsbook grid: `264px | 1fr | 340px` (left rail, centre, bet slip);
  the rail collapses to `60px` of sport icons.
- Tablet (`lg`): `228px | 1fr` — narrower rail, bet slip becomes the bottom sheet.
  Below `lg` the rail becomes a start-edge drawer.
- Mobile: single column, bet slip becomes a floating bar + bottom sheet.
- Sticky header is 60px (`--spacing-header`); the sports nav sits below it and
  is also sticky on desktop.
- Vertical rhythm between major sections: `space-y-8 lg:space-y-10`.
