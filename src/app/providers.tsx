"use client";

import { I18nProvider } from "@/i18n/I18nProvider";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/types";
import { ThemeProvider } from "@/theme/ThemeProvider";
import type { Theme } from "@/theme/config";
import { ToastProvider } from "@/components/ui/Toast";
import { WalletProvider } from "@/components/wallet/WalletProvider";

/**
 * Client-side provider stack: theme, locale, toasts, casino wallet.
 *
 * The casino wallet sits above the shell so the navbar balance and the game
 * screens read the same server-returned figure — one balance, no drift.
 * Bet-slip state lives in a zustand store and needs no provider.
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
        <ToastProvider>
          <WalletProvider>{children}</WalletProvider>
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
