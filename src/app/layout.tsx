import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter, Noto_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { APP } from "@/config/app.config";
import { LOCALE_META } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { getRequestLocale } from "@/i18n/server";
import { THEME_INIT_SCRIPT } from "@/theme/config";
import { getServerTheme } from "@/theme/server";
import { Providers } from "./providers";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-inter",
});

const arabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL(APP.url),
  title: {
    default: "SportGo — Bet smarter. Follow the game.",
    template: "%s · SportGo",
  },
  description:
    "SportGo is a sports betting and sports entertainment interface. This build runs in demonstration mode: all odds, balances and bets are simulated.",
  applicationName: APP.name,
  robots: { index: false, follow: false },
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = {
  // Matches each theme's canvas, so the browser chrome does not fight the page.
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#070b16" },
    { media: "(prefers-color-scheme: light)", color: "#f3f6fc" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [locale, theme, requestHeaders] = await Promise.all([
    getRequestLocale(),
    getServerTheme(),
    headers(),
  ]);
  const dictionary = await getDictionary(locale);
  const { dir } = LOCALE_META[locale];

  // The proxy mints a per-request nonce; the inline theme script must carry it
  // or the Content-Security-Policy blocks it and the page flashes.
  const nonce = requestHeaders.get("x-nonce") ?? undefined;

  return (
    <html
      lang={locale}
      dir={dir}
      data-theme={theme}
      className={`${inter.variable} ${arabic.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-canvas text-ink antialiased">
        {/* Runs synchronously before any content paints. It only has work to do
            when the server could not know the answer: a first visit, or an
            explicit "system" preference. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <Providers initialTheme={theme} locale={locale} dictionary={dictionary}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
