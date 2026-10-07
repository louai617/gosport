import Link from "next/link";
import { LogOut } from "lucide-react";
import { APP, IS_DEMO } from "@/config/app.config";
import { getAdminT } from "@/i18n/server";
import { logoutAction } from "@/app/actions/auth";
import { requirePageAdmin } from "@/server/auth/pageGuard";
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
export async function AdminShell({ children }: { children: React.ReactNode }) {
  const user = await requirePageAdmin();
  const [t, notifications] = await Promise.all([getAdminT(), getNotifications({ limit: 10 })]);

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

          <AdminSearch />

          <div className="ms-auto flex items-center gap-1">
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
        <AdminNav />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
