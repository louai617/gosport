import type { Metadata } from "next";
import { getAdminDictionary } from "@/i18n/dictionaries";
import { getRequestLocale } from "@/i18n/server";
import { I18nProvider } from "@/i18n/I18nProvider";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: { default: "Admin · SportGo", template: "%s · Admin · SportGo" },
  robots: { index: false, follow: false },
};

/**
 * The admin dictionary loads only here, so the operator vocabulary never
 * reaches a player's bundle. Only the i18n context is re-provided — theme and
 * toasts come from the root layout, because a second ThemeProvider would be a
 * competing source of truth for the same attribute.
 */
export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getRequestLocale();
  const dictionary = await getAdminDictionary(locale);

  return (
    <I18nProvider locale={locale} dictionary={dictionary}>
      <AdminShell>{children}</AdminShell>
    </I18nProvider>
  );
}
