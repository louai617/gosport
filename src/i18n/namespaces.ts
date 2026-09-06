/**
 * Translation namespaces.
 *
 * Every namespace exists once per locale at `locales/<locale>/<ns>.json` as a
 * flat `{ "dotted.key": "value" }` map. Splitting by domain keeps files small
 * and lets separate feature areas own their strings without collisions.
 *
 * `APP_NAMESPACES` ship on every page; `ADMIN_NAMESPACES` load only under
 * /admin so the operator vocabulary never reaches a player's bundle.
 */
export const APP_NAMESPACES = [
  "common",
  "home",
  "sportsbook",
  "betting",
  "auth",
  "account",
  "wallet",
  "promotions",
  "responsible",
  "legal",
  "games",
] as const;

export const ADMIN_NAMESPACES = ["admin"] as const;

export type AppNamespace = (typeof APP_NAMESPACES)[number];
export type AdminNamespace = (typeof ADMIN_NAMESPACES)[number];
