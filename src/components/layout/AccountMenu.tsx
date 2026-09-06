"use client";

import Link from "next/link";
import {
  CircleHelp,
  LayoutDashboard,
  LogOut,
  Receipt,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import type { SessionUser } from "@/types";
import { logoutAction } from "@/app/actions/auth";
import { useT } from "@/i18n/I18nProvider";
import { Avatar } from "@/components/ui/Avatar";
import {
  Dropdown,
  DropdownItem,
  DropdownLabel,
  DropdownSeparator,
} from "@/components/ui/Dropdown";
import { ThemeToggle } from "./ThemeToggle";

export interface AccountMenuProps {
  user: SessionUser;
}

const LINKS = [
  { href: "/account", labelKey: "account.nav.overview", icon: LayoutDashboard },
  { href: "/wallet", labelKey: "account.nav.wallet", icon: Wallet },
  { href: "/account/bets", labelKey: "account.nav.bets", icon: Receipt },
  { href: "/account/responsible", labelKey: "account.nav.responsible", icon: ShieldCheck },
  { href: "/help", labelKey: "nav.help", icon: CircleHelp },
] as const;

/**
 * Signed-in account menu.
 *
 * Carries the theme toggle and sign-out so both stay reachable on the narrow
 * widths where the standalone navbar buttons drop out — the header degrades by
 * moving controls in here, never by removing them.
 */
export function AccountMenu({ user }: AccountMenuProps) {
  const t = useT();
  const fullName = `${user.firstName} ${user.lastName}`;

  return (
    <Dropdown
      align="end"
      width="w-60"
      label={t("nav.account")}
      trigger={
        <span className="flex h-9 items-center gap-2 rounded-md px-1 transition-colors duration-fast hover:bg-surface-2">
          <Avatar name={fullName} size="sm" />
          <span className="hidden max-w-24 truncate text-small font-medium text-ink xl:block">
            {user.firstName}
          </span>
        </span>
      }
    >
      <DropdownLabel>{fullName}</DropdownLabel>

      {LINKS.map((link) => (
        <DropdownItem
          key={link.href}
          href={link.href}
          icon={<link.icon size={15} aria-hidden="true" />}
        >
          {t(link.labelKey)}
        </DropdownItem>
      ))}

      <DropdownSeparator />
      <ThemeToggle variant="full" />

      <DropdownSeparator />
      <form action={logoutAction}>
        <button
          type="submit"
          className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-start text-small text-danger transition-colors duration-fast hover:bg-danger-soft"
        >
          <LogOut size={15} aria-hidden="true" className="flip-rtl" />
          {t("nav.logout")}
        </button>
      </form>
    </Dropdown>
  );
}
