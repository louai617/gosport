import Link from "next/link";
import { LogOut } from "lucide-react";
import { APP, IS_DEMO } from "@/config/app.config";
import { getAdminT, getRequestLocale } from "@/i18n/server";
import { logoutAction } from "@/app/actions/auth";
import { requirePageAdmin } from "@/server/auth/pageGuard";
import { can, type Permission } from "@/server/auth/permissions";
import { getOwnBalance } from "@/services/creditService";
import { formatAmount } from "@/lib/format";
import { getNotifications } from "@/services/notificationService";
import { LogoMark } from "@/components/brand/LogoMark";
import { LanguageSelector } from "@/components/navigation/LanguageSelector";
import { NotificationDropdown } from "@/components/notifications/NotificationDropdown";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Avatar } from "@/components/ui/Avatar";
import { AdminNav } from "./AdminNav";
import { AdminSearch } from "./AdminSearch";

/**
 * Operator console chrome.
 *
 * Deliberately distinct from the player-facing shell: a different header, a
 * persistent rail, no bet slip, no promotional surface. Someone glancing at a
 * screen should never have to work out which side of the product they are on.
 *
 * Rendering this is gated on `requirePageAdmin()` — a convenience for the
 * experience (a signed-out visitor is sent to sign in, a player gets a 404).
 * Each admin page's data still comes through services that check the permission
 * themselves.
 */
/** Which console sections each role may open. Pages and services re-check every one. */
const NAV_PERMISSIONS: ReadonlyArray<readonly [string, Permission]> = [
  ["/admin", "admin.access"],
  ["/admin/managers", "managers.read"],
  ["/admin/players", "players.read"],
  ["/admin/transactions", "transactions.read"],
  ["/admin/wallet", "wallet.read"],
  ["/admin/bets", "bets.read"],
  ["/admin/reports", "reports.read"],
  ["/admin/responsible-gambling", "rg.read"],
  ["/admin/audit", "audit.read"],
  ["/admin/notifications", "notifications.read"],
  ["/admin/settings", "settings.read"],
];

export async function AdminShell({ children }: { children: React.ReactNode }) {
  const user = await requirePageAdmin();
  const [t, locale, notifications] = await Promise.all([
    getAdminT(),
    getRequestLocale(),
    getNotifications({ limit: 10 }),
  ]);
  // A manager works from a balance: keep it in view on every screen.
  const balance = can(user.role, "credit.distribute")
    ? formatAmount(await getOwnBalance(user), locale)
    : null;
  const allowedNav = NAV_PERMISSIONS.filter(([, permission]) => can(user.role, permission)).map(
    ([href]) => href,
  );

  return (
    <div className="flex min-h-dvh flex-col">
      {IS_DEMO ? (
        <p className="border-b border-warning/25 bg-warning-soft px-4 py-2 text-center text-caption normal-case tracking-normal text-warning">
          {t("admin.demoBanner")}
        </p>
      ) : null}

      <header className="glass sticky top-0 z-50 border-b border-line">
        <div className="mx-auto flex h-[var(--spacing-header)] max-w-[1600px] items-center gap-3 px-4 sm:px-6">
          <Link href="/admin" className="flex shrink-0 items-center gap-2.5">
            <LogoMark size={24} />
            <span className="text-h3 text-ink">
              SportGo
              <span className="ms-1.5 text-small font-medium text-ink-subtle">{t("admin.console")}</span>
            </span>
          </Link>

          {can(user.role, "search.use") ? <AdminSearch /> : null}

          <div className="ms-auto flex items-center gap-1">
            {balance ? (
              <span
                title={t("admin.credit.yourBalance")}
                className="numeric me-1 rounded-md border border-primary/30 bg-primary-soft px-2.5 py-1 text-small font-semibold text-primary"
              >
                {balance}
              </span>
            ) : null}
            <span className="numeric me-1 hidden rounded-md border border-line bg-surface-2 px-2 py-1 text-caption text-ink-subtle sm:block">
              {APP.mode}
            </span>

            <Link
              href="/"
              className="hidden rounded-md px-2.5 py-1.5 text-small text-ink-muted transition-colors duration-fast hover:bg-surface-2 hover:text-ink lg:block"
            >
              {t("admin.backToSite")}
            </Link>

            <NotificationDropdown notifications={notifications} />
            <div className="hidden sm:block">
              <LanguageSelector />
            </div>
            <ThemeToggle />

            <Link
              href="/admin/security"
              title={t("admin.nav.security")}
              className="flex h-9 items-center gap-2 rounded-md px-1.5 transition-colors duration-fast hover:bg-surface-2"
            >
              <Avatar name={user.displayName} size="sm" />
              <span className="hidden max-w-28 truncate text-small font-medium text-ink lg:block">
                {user.username}
              </span>
            </Link>

            <form action={logoutAction}>
              <button
                type="submit"
                aria-label={t("nav.logout")}
                title={t("nav.logout")}
                className="grid size-8 cursor-pointer place-items-center rounded-md text-ink-muted transition-colors duration-fast hover:bg-danger-soft hover:text-danger"
              >
                <LogOut size={17} aria-hidden="true" className="flip-rtl" />
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1600px] flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[228px_minmax(0,1fr)]">
        <AdminNav allowed={allowedNav} />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
