"use client";

import { createContext, useCallback, useContext, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  LOCALE_META,
  type Direction,
  type Locale,
} from "./config";
import { createTranslator } from "./translate";
import type { Dictionary, TranslateFn } from "./types";

interface I18nContextValue {
  locale: Locale;
  dir: Direction;
  /** BCP-47 tag for Intl formatting. */
  bcp47: string;
  t: TranslateFn;
  setLocale: (next: Locale) => void;
  isSwitching: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const ONE_YEAR = 60 * 60 * 24 * 365;

export function I18nProvider({
  locale,
  dictionary,
  children,
}: {
  locale: Locale;
  dictionary: Dictionary;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isSwitching, startTransition] = useTransition();

  const t = useMemo(() => createTranslator(dictionary), [dictionary]);

  const setLocale = useCallback(
    (next: Locale) => {
      document.cookie = `${LOCALE_COOKIE}=${next};path=/;max-age=${ONE_YEAR};samesite=lax`;
      // The server layout re-reads the cookie and swaps <html lang/dir>.
      startTransition(() => router.refresh());
    },
    [router],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      dir: LOCALE_META[locale].dir,
      bcp47: LOCALE_META[locale].bcp47,
      t,
      setLocale,
      isSwitching,
    }),
    [locale, t, setLocale, isSwitching],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used inside <I18nProvider>");
  }
  return ctx;
}

/** Convenience hook when only the translate function is needed. */
export function useT(): TranslateFn {
  return useI18n().t;
}

export { DEFAULT_LOCALE };
