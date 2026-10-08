"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  HandCoins,
  LayoutDashboard,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { ScrollFade } from "@/components/ui/ScrollFade";

interface AdminNavItem {
  href: string;
  labelKey: string;
  icon: typeof Users;
  exact?: boolean;
}

/**
 * Every entry here has a real backend behind it. The catalogue screens that used
 * to sit in this list (events, competitions, promotions, game catalogue) edited a
 * generated demo feed, not stored data, and were removed rather than left as
 * controls that do nothing.
 */
const ITEMS: AdminNavItem[] = [
  { href: "/admin", labelKey: "admin.nav.dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/managers", labelKey: "admin.nav.managers", icon: UserCog },
  { href: "/admin/players", labelKey: "admin.nav.players", icon: Users },
  { href: "/admin/transactions", labelKey: "admin.nav.transactions", icon: Receipt },
  { href: "/admin/wallet", labelKey: "admin.nav.wallet", icon: HandCoins },
  { href: "/admin/bets", labelKey: "admin.nav.bets", icon: Wallet },
  { href: "/admin/reports", labelKey: "admin.nav.reports", icon: BarChart3 },
  { href: "/admin/responsible-gambling", labelKey: "admin.nav.responsible", icon: ShieldCheck },
  { href: "/admin/audit", labelKey: "admin.nav.audit", icon: ScrollText },
  { href: "/admin/notifications", labelKey: "admin.nav.notifications", icon: Bell },
  { href: "/admin/settings", labelKey: "admin.nav.settings", icon: Settings },
];

export function AdminNav({ allowed }: { allowed: readonly string[] }) {
  const t = useT();
  const pathname = usePathname();
  // The server decides which entries this role may see; hiding the rest is a courtesy,
  // the pages and services refuse anyway.
  const items = ITEMS.filter((item) => allowed.includes(item.href));

  const isActive = (item: AdminNavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <>
      <nav aria-label={t("admin.console")} className="min-w-0 lg:hidden">
        <ScrollFade showControls={false}>
          <ul className="flex gap-1.5 pb-1">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item) ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center gap-2 whitespace-nowrap rounded-md border px-3 text-small transition-colors duration-fast",
                    isActive(item)
                      ? "border-primary/40 bg-primary-soft font-semibold text-primary"
                      : "border-line bg-surface text-ink-muted hover:text-ink",
                  )}
                >
                  <item.icon size={15} aria-hidden="true" />
                  {t(item.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </ScrollFade>
      </nav>

      <aside className="hidden lg:block">
        <nav
          aria-label={t("admin.console")}
          className="sticky top-[calc(var(--spacing-header)+1rem)] rounded-xl border border-line bg-surface p-2"
        >
          <ul className="space-y-0.5">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(item) ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-small transition-colors duration-fast",
                    isActive(item)
                      ? "bg-primary-soft font-semibold text-primary"
                      : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <item.icon
                    size={16}
                    aria-hidden="true"
                    className={isActive(item) ? "" : "text-ink-subtle"}
                  />
                  <span className="truncate">{t(item.labelKey)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  );
}
