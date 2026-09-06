"use client";

import { I18nProvider } from "@/i18n/I18nProvider";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/types";
import { ThemeProvider } from "@/theme/ThemeProvider";
import type { Theme } from "@/theme/config";
import { ToastProvider } from "@/components/ui/Toast";

/**
 * Client-side provider stack: theme, locale, toasts.
 *
 * Bet-slip and casino state live in zustand stores and need no provider.
 */
export function Providers({
  initialTheme,
  locale,
  dictionary,
  children,
}: {
  initialTheme: Theme;
  locale: Locale;
  dictionary: Dictionary;
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider initialTheme={initialTheme}>
      <I18nProvider locale={locale} dictionary={dictionary}>
        <ToastProvider>{children}</ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
