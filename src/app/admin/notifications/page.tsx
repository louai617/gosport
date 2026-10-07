import type { Metadata } from "next";
import Link from "next/link";
import { BellOff } from "lucide-react";
import { markAllNotificationsReadFormAction } from "@/app/actions/account";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { getAdminT, getRequestLocale } from "@/i18n/server";
import { requirePageAdmin } from "@/server/auth/pageGuard";
import { activeTransportId } from "@/server/notifications/transport";
import { configuredChannels } from "@/server/notifications/notify";
import { getNotifications } from "@/services/notificationService";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Notifications" };

export default async function AdminNotificationsPage() {
  await requirePageAdmin("notifications.read");
  const [t, locale, notifications] = await Promise.all([getAdminT(), getRequestLocale(), getNotifications({ limit: 100 })]);
  const channels = configuredChannels();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-h1 text-ink">{t("admin.notifications.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">{t("admin.notifications.description")}</p>
      </header>

      <Alert tone="info" title={t("admin.notifications.channelsTitle")}>
        <span className="flex flex-wrap items-center gap-2">
          {channels.map((channel) => (
            <Badge key={channel} tone="success">{channel}</Badge>
          ))}
          <span>{t("admin.notifications.channelsNote")}</span>
          {activeTransportId() ? <Badge tone="warning">{activeTransportId()}</Badge> : null}
        </span>
      </Alert>

      {notifications.some((n) => !n.read) ? (
        <form action={markAllNotificationsReadFormAction}>
          <Button type="submit" variant="secondary" size="sm">{t("notifications.markAllRead")}</Button>
        </form>
      ) : null}

      {notifications.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState icon={<BellOff size={20} aria-hidden="true" />} title={t("empty.noNotifications")} />
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
                <span aria-hidden="true" className={cn("mt-2 size-1.5 shrink-0 rounded-full", notification.read ? "bg-transparent" : "bg-primary")} />
                <span className="min-w-0 flex-1">
                  <span className="block text-small font-medium text-ink">{t(notification.titleKey, notification.params)}</span>
                  <span className="mt-0.5 block text-small leading-relaxed text-ink-muted">{t(notification.bodyKey, notification.params)}</span>
                  <span className="numeric mt-1.5 block text-caption normal-case tracking-normal text-ink-subtle">{formatDateTime(notification.createdAt, locale)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
