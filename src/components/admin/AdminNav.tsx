"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  Gamepad2,
  Gift,
  LayoutDashboard,
  Receipt,
  Settings,
  ShieldCheck,
  Trophy,
  Users,
  Volleyball,
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

const ITEMS: AdminNavItem[] = [
  { href: "/admin", labelKey: "admin.nav.dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", labelKey: "admin.nav.users", icon: Users },
  { href: "/admin/events", labelKey: "admin.nav.events", icon: CalendarDays },
  { href: "/admin/sports", labelKey: "admin.nav.sports", icon: Volleyball },
  { href: "/admin/games", labelKey: "admin.nav.games", icon: Gamepad2 },
  { href: "/admin/competitions", labelKey: "admin.nav.competitions", icon: Trophy },
  { href: "/admin/bets", labelKey: "admin.nav.bets", icon: Receipt },
  { href: "/admin/transactions", labelKey: "admin.nav.transactions", icon: Wallet },
  { href: "/admin/promotions", labelKey: "admin.nav.promotions", icon: Gift },
  { href: "/admin/reports", labelKey: "admin.nav.reports", icon: BarChart3 },
  {
    href: "/admin/responsible-gambling",
    labelKey: "admin.nav.responsible",
    icon: ShieldCheck,
  },
  { href: "/admin/settings", labelKey: "admin.nav.settings", icon: Settings },
];

export function AdminNav() {
  const t = useT();
  const pathname = usePathname();

  const isActive = (item: AdminNavItem) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.href);

  return (
    <>
      <nav aria-label={t("admin.console")} className="min-w-0 lg:hidden">
        <ScrollFade showControls={false}>
          <ul className="flex gap-1.5 pb-1">
            {ITEMS.map((item) => (
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
            {ITEMS.map((item) => (
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
