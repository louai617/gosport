import Link from "next/link";
import { APP, IS_DEMO } from "@/config/app.config";
import { getAdminT } from "@/i18n/server";
import { LogoMark } from "@/components/brand/LogoMark";
import { AdminNav } from "./AdminNav";

/**
 * Operator console chrome.
 *
 * Deliberately distinct from the player-facing shell: a different header, a
 * persistent rail, no bet slip, no promotional surface. Someone glancing at a
 * screen should never have to work out which side of the product they are on.
 */
export async function AdminShell({ children }: { children: React.ReactNode }) {
  const t = await getAdminT();

  return (
    <div className="flex min-h-dvh flex-col">
      {IS_DEMO ? (
        <p className="border-b border-warning/25 bg-warning-soft px-4 py-2 text-center text-caption normal-case tracking-normal text-warning">
          {t("admin.demoBanner")}
        </p>
      ) : null}

      <header className="glass sticky top-0 z-50 border-b border-line">
        <div className="mx-auto flex h-[var(--spacing-header)] max-w-[1600px] items-center gap-4 px-4 sm:px-6">
          <Link href="/admin" className="flex items-center gap-2.5">
            <LogoMark size={24} />
            <span className="text-h3 text-ink">
              SportGo<span className="ms-1.5 text-small font-medium text-ink-subtle">
                {t("admin.console")}
              </span>
            </span>
          </Link>

          <span className="numeric ms-auto rounded-md border border-line bg-surface-2 px-2 py-1 text-caption text-ink-subtle">
            {APP.mode}
          </span>

          <Link
            href="/"
            className="rounded-md px-2.5 py-1.5 text-small text-ink-muted transition-colors duration-fast hover:bg-surface-2 hover:text-ink"
          >
            {t("admin.backToSite")}
          </Link>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1600px] flex-1 gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[228px_minmax(0,1fr)]">
        <AdminNav />
        <main className="min-w-0">{children}</main>
      </div>
    </div>
  );
}
