"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CircleHelp,
  Gamepad2,
  Gift,
  ListChecks,
  LogIn,
  LogOut,
  Radio,
  ShieldCheck,
  Star,
  UserPlus,
} from "lucide-react";
import type { SessionUser, Sport, Wallet } from "@/types";
import { logoutAction } from "@/app/actions/auth";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { useUiStore } from "@/store/uiStore";
import { Drawer } from "@/components/ui/Drawer";
import { buttonStyles } from "@/components/ui/Button";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import { LanguageSelector } from "@/components/navigation/LanguageSelector";
import { SportIcon } from "@/components/sports/SportIcon";
import { BalanceDisplay } from "@/components/account/BalanceDisplay";
import { ThemeToggle } from "./ThemeToggle";

export interface MobileNavProps {
  sports: Sport[];
  user: SessionUser | null;
  wallet: Wallet | null;
}

const PRIMARY = [
  { href: "/live", labelKey: "nav.live", icon: Radio },
  { href: "/sports", labelKey: "nav.sports", icon: Star },
  { href: "/games", labelKey: "nav.games", icon: Gamepad2 },
  { href: "/promotions", labelKey: "nav.promotions", icon: Gift },
  { href: "/results", labelKey: "nav.results", icon: ListChecks },
] as const;

const SECONDARY = [
  { href: "/responsible-gambling", labelKey: "nav.responsibleGambling", icon: ShieldCheck },
  { href: "/help", labelKey: "nav.help", icon: CircleHelp },
] as const;

export function MobileNav({ sports, user, wallet }: MobileNavProps) {
  const t = useT();
  const pathname = usePathname();
  const open = useUiStore((state) => state.mobileNavOpen);
  const setOpen = useUiStore((state) => state.setMobileNavOpen);

  const close = () => setOpen(false);

  return (
    <Drawer side="start" open={open} onClose={close} title={t("nav.menu")}>
      <div className="space-y-6">
        <GlobalSearch variant="block" />

        {/* The balance is too wide for a 375px navbar, so it lives here — the
            first thing in the drawer rather than a cramped afterthought. */}
        {user && wallet ? (
          <BalanceDisplay balance={wallet.balance} variant="block" />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Link href="/login" onClick={close} className={buttonStyles({ variant: "secondary" })}>
              <LogIn size={15} aria-hidden="true" />
              {t("nav.login")}
            </Link>
            <Link href="/register" onClick={close} className={buttonStyles()}>
              <UserPlus size={15} aria-hidden="true" />
              {t("nav.register")}
            </Link>
          </div>
        )}

        <Section title={t("nav.sports")}>
          <ul className="grid grid-cols-2 gap-1">
            {sports.map((sport) => (
              <li key={sport.id}>
                <Link
                  href={`/sports/${sport.key}`}
                  onClick={close}
                  className="flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-small text-ink-muted transition-colors duration-fast hover:bg-surface-2 hover:text-ink"
                >
                  <SportIcon name={sport.icon} size={17} className="text-ink-subtle" />
                  <span className="truncate">{t(sport.nameKey)}</span>
                  {sport.liveEventCount > 0 ? (
                    <span className="numeric ms-auto text-caption font-semibold text-live">
                      {sport.liveEventCount}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t("nav.menu")}>
          <NavList items={PRIMARY} pathname={pathname} onNavigate={close} />
        </Section>

        <Section title={t("footer.support")}>
          <NavList items={SECONDARY} pathname={pathname} onNavigate={close} />
        </Section>

        <div className="space-y-1 border-t border-line-soft pt-4">
          <ThemeToggle variant="full" />
          <LanguageSelector variant="full" />

          {user ? (
            <form action={logoutAction}>
              <button
                type="submit"
                className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2.5 text-small text-danger transition-colors duration-fast hover:bg-danger-soft"
              >
                <LogOut size={17} aria-hidden="true" className="flip-rtl" />
                {t("nav.logout")}
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 px-1 text-caption uppercase text-ink-subtle">{title}</h3>
      {children}
    </section>
  );
}

function NavList({
  items,
  pathname,
  onNavigate,
}: {
  items: ReadonlyArray<{ href: string; labelKey: string; icon: typeof Radio }>;
  pathname: string;
  onNavigate: () => void;
}) {
  const t = useT();

  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2.5 text-small transition-colors duration-fast",
                active
                  ? "bg-primary-soft font-semibold text-primary"
                  : "text-ink-muted hover:bg-surface-2 hover:text-ink",
              )}
            >
              <Icon size={17} aria-hidden="true" className={active ? "" : "text-ink-subtle"} />
              {t(item.labelKey)}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
