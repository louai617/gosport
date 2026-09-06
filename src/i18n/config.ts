export const LOCALES = ["fr", "ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = ((): Locale => {
  const fromEnv = process.env.NEXT_PUBLIC_DEFAULT_LOCALE as Locale | undefined;
  return fromEnv && (LOCALES as readonly string[]).includes(fromEnv) ? fromEnv : "fr";
})();

export const LOCALE_COOKIE = "sportgo_locale";

export type Direction = "ltr" | "rtl";

export const LOCALE_META: Record<
  Locale,
  { label: string; englishLabel: string; dir: Direction; bcp47: string; flag: string }
> = {
  fr: { label: "Français", englishLabel: "French", dir: "ltr", bcp47: "fr-TN", flag: "🇫🇷" },
  ar: { label: "العربية", englishLabel: "Arabic", dir: "rtl", bcp47: "ar-TN", flag: "🇹🇳" },
  en: { label: "English", englishLabel: "English", dir: "ltr", bcp47: "en-GB", flag: "🇬🇧" },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function resolveLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function directionOf(locale: Locale): Direction {
  return LOCALE_META[locale].dir;
}
