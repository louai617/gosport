"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  LayoutDashboard,
  LogOut,
  Receipt,
  ShieldCheck,
  ShieldHalf,
  UserRound,
  Wallet,
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { ScrollFade } from "@/components/ui/ScrollFade";

interface NavItem {
  href: string;
  labelKey: string;
  icon: typeof Wallet;
  /** Overview routes are prefixes of their children, so they match exactly. */
  exact?: boolean;
}

interface NavSection {
  titleKey: string;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    titleKey: "account.nav.account",
    items: [
      { href: "/account", labelKey: "account.nav.overview", icon: LayoutDashboard, exact: true },
      { href: "/account/bets", labelKey: "account.nav.bets", icon: Receipt },
      { href: "/account/transactions", labelKey: "account.nav.transactions", icon: Wallet },
      { href: "/account/notifications", labelKey: "account.nav.notifications", icon: Bell },
    ],
  },
  {
    titleKey: "account.nav.wallet",
    items: [
      { href: "/wallet", labelKey: "account.nav.walletOverview", icon: Wallet, exact: true },
      { href: "/wallet/deposit", labelKey: "wallet.deposit.title", icon: Wallet },
      { href: "/wallet/withdraw", labelKey: "wallet.withdraw.title", icon: Wallet },
    ],
  },
  {
    titleKey: "account.nav.settings",
    items: [
      { href: "/account/profile", labelKey: "account.nav.profile", icon: UserRound },
      { href: "/account/security", labelKey: "account.nav.security", icon: ShieldHalf },
      { href: "/account/responsible", labelKey: "account.nav.responsible", icon: ShieldCheck },
    ],
  },
];

/**
 * Account section navigation: a rail on desktop, a horizontal scroller on
 * mobile. Responsible-gambling sits in the same list as everything else — it
 * is a first-class account control, not a link to bury.
 */
export function AccountNav() {
  const t = useT();
  const pathname = usePathname();

  const isActive = (href: string, exact?: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  const flat = SECTIONS.flatMap((section) => section.items);

  return (
    <>
      {/* Mobile: one scrolling row of chips. */}
      <nav aria-label={t("account.nav.account")} className="min-w-0 lg:hidden">
        <ScrollFade showControls={false}>
          <ul className="flex gap-1.5 pb-1">
            {flat.map((item) => {
              const active = isActive(item.href, item.exact);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center gap-2 whitespace-nowrap rounded-md border px-3 text-small transition-colors duration-fast",
                      active
                        ? "border-primary/40 bg-primary-soft font-semibold text-primary"
                        : "border-line bg-surface text-ink-muted hover:text-ink",
                    )}
                  >
                    <item.icon size={15} aria-hidden="true" />
                    {t(item.labelKey)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </ScrollFade>
      </nav>

      {/* Desktop: grouped rail. */}
      <aside className="hidden lg:block">
        <div className="sticky top-[calc(var(--spacing-header)+1rem)] space-y-5 rounded-xl border border-line bg-surface p-3">
          {SECTIONS.map((section) => (
            <nav key={section.titleKey} aria-label={t(section.titleKey)}>
              <h2 className="mb-1.5 px-2.5 text-caption uppercase text-ink-subtle">
                {t(section.titleKey)}
              </h2>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.href, item.exact);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-small transition-colors duration-fast",
                          active
                            ? "bg-primary-soft font-semibold text-primary"
                            : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                        )}
                      >
                        <item.icon
                          size={16}
                          aria-hidden="true"
                          className={active ? "" : "text-ink-subtle"}
                        />
                        <span className="truncate">{t(item.labelKey)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ))}

          <form action={logoutAction} className="border-t border-line-soft pt-3">
            <button
              type="submit"
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-small text-ink-muted transition-colors duration-fast hover:bg-danger-soft hover:text-danger"
            >
              <LogOut size={16} aria-hidden="true" className="flip-rtl" />
              {t("nav.logout")}
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
