"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp, LogOut, Menu } from "lucide-react";
import type { AppNotification, SessionUser, Sport, Wallet } from "@/types";
import { logoutAction } from "@/app/actions/auth";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { useUiStore } from "@/store/uiStore";
import { Logo } from "@/components/brand/Logo";
import { buttonStyles } from "@/components/ui/Button";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { LanguageSelector } from "@/components/navigation/LanguageSelector";
import { NotificationDropdown } from "@/components/notifications/NotificationDropdown";
import { AccountMenu } from "./AccountMenu";
import { ThemeToggle } from "./ThemeToggle";
import { BalanceDisplay } from "@/components/account/BalanceDisplay";
import { MobileNav } from "./MobileNav";

export interface HeaderProps {
  sports: Sport[];
  notifications: AppNotification[];
  /** Null when signed out; the header swaps its right side accordingly. */
  user: SessionUser | null;
  /** Null for guests and for administrators, who have no wallet. */
  wallet: Wallet | null;
}

const NAV = [
  { href: "/sports", labelKey: "nav.sports" },
  { href: "/live", labelKey: "nav.live" },
  { href: "/games", labelKey: "nav.games" },
  { href: "/popular", labelKey: "nav.popular" },
  { href: "/promotions", labelKey: "nav.promotions" },
  { href: "/results", labelKey: "nav.results" },
] as const;

/**
 * Sticky header, 60px.
 *
 * Deliberately shallow: on a sportsbook the fixture list is the product, and
 * every pixel of chrome is a pixel of board the user cannot see. Search is
 * inline on desktop and moves into the drawer on mobile rather than becoming
 * a second row.
 */
export function Header({ sports, notifications, user, wallet }: HeaderProps) {
  const t = useT();
  const pathname = usePathname();
  const openMobileNav = useUiStore((state) => state.setMobileNavOpen);

  return (
    <>
      <header className="glass sticky top-0 z-50 border-b border-line">
        <div className="mx-auto flex h-[var(--spacing-header)] max-w-[1440px] items-center gap-3 px-4 sm:px-6 lg:gap-6 lg:px-8">
          <button
            type="button"
            onClick={() => openMobileNav(true)}
            aria-label={t("nav.openMenu")}
            className="-ms-1 grid size-9 shrink-0 cursor-pointer place-items-center rounded-md text-ink-muted transition-colors duration-fast hover:bg-surface-2 hover:text-ink xl:hidden"
          >
            <Menu size={19} aria-hidden="true" />
          </button>

          <Logo href="/" size="md" className="shrink-0" />

          <nav aria-label={t("nav.menu")} className="hidden xl:block">
            <ul className="flex items-center gap-0.5">
              {NAV.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "relative flex h-9 items-center whitespace-nowrap rounded-md px-3 text-small font-medium transition-colors duration-fast",
                        active
                          ? "text-ink"
                          : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                      )}
                    >
                      {t(item.labelKey)}
                      {active ? (
                        <span
                          aria-hidden="true"
                          className="absolute inset-x-3 -bottom-[9px] h-0.5 rounded-full bg-primary"
                        />
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <GlobalSearch className="ms-auto hidden max-w-44 flex-1 md:block xl:max-w-72" />

          {/* Balance → Notifications → Language → Theme → Account → Logout.
              Controls drop out of the bar from the least essential inward as
              width shrinks; every one of them also lives in the account menu
              or the mobile drawer, so nothing becomes unreachable. */}
          <div className="ms-auto flex items-center gap-1 md:ms-0">
            {user && wallet ? (
              <BalanceDisplay
                balance={wallet.balance}
                className="me-1 hidden md:flex"
              />
            ) : null}

            {user ? <NotificationDropdown notifications={notifications} /> : null}

            {!user ? (
              <Link
                href="/help"
                aria-label={t("nav.help")}
                className="hidden size-8 place-items-center rounded-md text-ink-muted transition-colors duration-fast hover:bg-surface-2 hover:text-ink sm:grid"
              >
                <CircleHelp size={17} aria-hidden="true" />
              </Link>
            ) : null}

            <div className="hidden sm:block">
              <LanguageSelector />
            </div>

            <ThemeToggle />

            {user ? (
              <>
                <AccountMenu user={user} />

                <form action={logoutAction} className="hidden xl:block">
                  <button
                    type="submit"
                    aria-label={t("nav.logout")}
                    title={t("nav.logout")}
                    className="grid size-8 cursor-pointer place-items-center rounded-md text-ink-muted transition-colors duration-fast hover:bg-danger-soft hover:text-danger"
                  >
                    <LogOut size={17} aria-hidden="true" className="flip-rtl" />
                  </button>
                </form>
              </>
            ) : (
              <div className="ms-1 flex items-center gap-2">
                <Link href="/login" className={buttonStyles({ size: "sm" })}>
                  {t("nav.login")}
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      <MobileNav sports={sports} user={user} wallet={wallet} />
    </>
  );
}
