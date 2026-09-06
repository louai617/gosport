import "server-only";
import type { Locale } from "./config";
import { DEFAULT_LOCALE, LOCALES } from "./config";
import { ADMIN_NAMESPACES, APP_NAMESPACES } from "./namespaces";
import type { Dictionary } from "./types";

/**
 * Dictionaries are loaded per request on the server and handed to the client
 * provider, so only the active locale reaches the browser.
 *
 * The import map is written out explicitly rather than built from a template
 * string: bundlers need statically analysable specifiers to code-split JSON.
 */
type Loader = () => Promise<{ default: Dictionary }>;

const appLoaders: Record<Locale, Loader[]> = {
  en: [
    () => import("@locales/en/common.json"),
    () => import("@locales/en/home.json"),
    () => import("@locales/en/sportsbook.json"),
    () => import("@locales/en/betting.json"),
    () => import("@locales/en/auth.json"),
    () => import("@locales/en/account.json"),
    () => import("@locales/en/wallet.json"),
    () => import("@locales/en/promotions.json"),
    () => import("@locales/en/responsible.json"),
    () => import("@locales/en/legal.json"),
    () => import("@locales/en/games.json"),
  ],
  fr: [
    () => import("@locales/fr/common.json"),
    () => import("@locales/fr/home.json"),
    () => import("@locales/fr/sportsbook.json"),
    () => import("@locales/fr/betting.json"),
    () => import("@locales/fr/auth.json"),
    () => import("@locales/fr/account.json"),
    () => import("@locales/fr/wallet.json"),
    () => import("@locales/fr/promotions.json"),
    () => import("@locales/fr/responsible.json"),
    () => import("@locales/fr/legal.json"),
    () => import("@locales/fr/games.json"),
  ],
  ar: [
    () => import("@locales/ar/common.json"),
    () => import("@locales/ar/home.json"),
    () => import("@locales/ar/sportsbook.json"),
    () => import("@locales/ar/betting.json"),
    () => import("@locales/ar/auth.json"),
    () => import("@locales/ar/account.json"),
    () => import("@locales/ar/wallet.json"),
    () => import("@locales/ar/promotions.json"),
    () => import("@locales/ar/responsible.json"),
    () => import("@locales/ar/legal.json"),
    () => import("@locales/ar/games.json"),
  ],
};

const adminLoaders: Record<Locale, Loader[]> = {
  en: [() => import("@locales/en/admin.json")],
  fr: [() => import("@locales/fr/admin.json")],
  ar: [() => import("@locales/ar/admin.json")],
};

const cache = new Map<string, Dictionary>();

async function merge(loaders: Loader[]): Promise<Dictionary> {
  const parts = await Promise.all(
    loaders.map((load) =>
      load().catch(() => ({ default: {} as Dictionary })),
    ),
  );
  return Object.assign({}, ...parts.map((part) => part.default)) as Dictionary;
}

async function build(locale: Locale, withAdmin: boolean): Promise<Dictionary> {
  const key = `${locale}:${withAdmin ? "admin" : "app"}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const loaders = [
    ...appLoaders[locale],
    ...(withAdmin ? adminLoaders[locale] : []),
  ];
  let dictionary = await merge(loaders);

  // A key a translator has not reached yet falls back to the default locale
  // rather than rendering as a raw dotted path.
  if (locale !== DEFAULT_LOCALE) {
    const base = await build(DEFAULT_LOCALE, withAdmin);
    dictionary = { ...base, ...dictionary };
  }

  cache.set(key, dictionary);
  return dictionary;
}

export function getDictionary(locale: Locale): Promise<Dictionary> {
  return build(locale, false);
}

export function getAdminDictionary(locale: Locale): Promise<Dictionary> {
  return build(locale, true);
}

export { APP_NAMESPACES, ADMIN_NAMESPACES, LOCALES };
