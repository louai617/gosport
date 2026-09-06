import { DEMO_DISPLAY_DECIMALS, JURISDICTION } from "@/config/app.config";
import { LOCALE_META, type Locale } from "@/i18n/config";

/**
 * Formatting helpers.
 *
 * All of these take an explicit locale so server and client render identically
 * — no hidden dependence on the machine's locale, which is a classic source of
 * hydration mismatches.
 */

function bcp47(locale: Locale): string {
  return LOCALE_META[locale]?.bcp47 ?? "en-GB";
}

/**
 * Money display. In demo mode this is a sandbox number, never a real balance.
 * Arabic uses Latin digits deliberately: odds and stakes read more clearly
 * against Latin-scripted team names, and it matches how most Tunisian betting
 * and banking interfaces present figures.
 */
export function formatAmount(
  value: number,
  locale: Locale,
  options?: { currency?: string; decimals?: number; withSymbol?: boolean },
): string {
  const currency = options?.currency ?? JURISDICTION.currency;
  const decimals = options?.decimals ?? DEMO_DISPLAY_DECIMALS;
  const withSymbol = options?.withSymbol ?? true;

  const number = new Intl.NumberFormat(`${bcp47(locale)}-u-nu-latn`, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);

  return withSymbol ? `${number} ${currency}` : number;
}

export function formatNumber(value: number, locale: Locale, decimals = 0): string {
  return new Intl.NumberFormat(`${bcp47(locale)}-u-nu-latn`, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Decimal odds are always shown to two places — 1.50, never 1.5. */
export function formatOdds(odds: number): string {
  return odds.toFixed(2);
}

export function formatDateTime(
  iso: string,
  locale: Locale,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(`${bcp47(locale)}-u-nu-latn`, {
    timeZone: JURISDICTION.timezone,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    ...options,
  }).format(new Date(iso));
}

export function formatTime(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(`${bcp47(locale)}-u-nu-latn`, {
    timeZone: JURISDICTION.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function formatDate(iso: string, locale: Locale): string {
  return new Intl.DateTimeFormat(`${bcp47(locale)}-u-nu-latn`, {
    timeZone: JURISDICTION.timezone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

/** Same calendar day in the configured timezone? Drives "Today"/"Tomorrow". */
function dayKeyIn(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: JURISDICTION.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

export type RelativeDay = "today" | "tomorrow" | "yesterday" | "other";

export function relativeDay(iso: string, now: Date): RelativeDay {
  const target = dayKeyIn(iso);
  const today = dayKeyIn(now.toISOString());
  if (target === today) return "today";

  const tomorrow = dayKeyIn(new Date(now.getTime() + 86_400_000).toISOString());
  if (target === tomorrow) return "tomorrow";

  const yesterday = dayKeyIn(new Date(now.getTime() - 86_400_000).toISOString());
  if (target === yesterday) return "yesterday";

  return "other";
}

export interface CountdownParts {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  expired: boolean;
}

export function countdownParts(targetIso: string, now: number): CountdownParts {
  const totalMs = Math.max(0, new Date(targetIso).getTime() - now);
  const totalSeconds = Math.floor(totalMs / 1000);
  return {
    totalMs,
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    expired: totalMs <= 0,
  };
}

export function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

/** +216 20 123 456 — display only; validation lives in `lib/validation`. */
export function formatPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  const cc = JURISDICTION.phoneCallingCode;
  if (!digits.startsWith(cc)) return e164;
  const national = digits.slice(cc.length);
  const groups = national.match(/.{1,2}/g) ?? [national];
  return `+${cc} ${groups.join(" ")}`;
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
