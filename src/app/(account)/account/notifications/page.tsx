import type { Metadata } from "next";
import Link from "next/link";
import { BellOff } from "lucide-react";
import { getNotifications } from "@/services/userService";
import { getT, getRequestLocale } from "@/i18n/server";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { EmptyState } from "@/components/ui/EmptyState";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("notifications.title") };
}

export default async function NotificationsPage() {
  const [t, locale, notifications] = await Promise.all([
    getT(),
    getRequestLocale(),
    getNotifications(),
  ]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-h1 text-ink">{t("notifications.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">
          {t("account.notifications.description")}
        </p>
      </header>

      {notifications.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            icon={<BellOff size={20} aria-hidden="true" />}
            title={t("empty.noNotifications")}
          />
        </div>
      ) : (
        <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-surface">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <Link
                href={notification.href ?? "#"}
                className={cn(
                  "flex gap-3 px-4 py-3.5 transition-colors duration-fast hover:bg-surface-2/60",
                  !notification.read && "bg-primary-soft/30",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-2 size-1.5 shrink-0 rounded-full",
                    notification.read ? "bg-transparent" : "bg-primary",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-small font-medium text-ink">
                    {t(notification.titleKey, notification.params)}
                  </span>
                  <span className="mt-0.5 block text-small leading-relaxed text-ink-muted">
                    {t(notification.bodyKey, notification.params)}
                  </span>
                  <span className="numeric mt-1.5 block text-caption normal-case tracking-normal text-ink-subtle">
                    {formatDateTime(notification.createdAt, locale)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
