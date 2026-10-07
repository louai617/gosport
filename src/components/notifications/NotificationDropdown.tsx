"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import type { AppNotification } from "@/types";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/actions/account";
import { cn } from "@/lib/cn";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/i18n/I18nProvider";
import { Dropdown } from "@/components/ui/Dropdown";
import { EmptyState } from "@/components/ui/EmptyState";

export interface NotificationDropdownProps {
  notifications: AppNotification[];
}

export function NotificationDropdown({ notifications }: NotificationDropdownProps) {
  const { t, locale } = useI18n();
  // Optimistic: the badge clears at once, and the server records it. The server
  // is the source of truth — a reload shows whatever it actually stored.
  const [readIds, setReadIds] = useState<string[]>([]);

  const isRead = (notification: AppNotification) =>
    notification.read || readIds.includes(notification.id);

  const unread = notifications.filter((notification) => !isRead(notification)).length;

  return (
    <Dropdown
      align="end"
      width="w-[22rem]"
      label={t("nav.notifications")}
      panelClassName="p-0"
      trigger={
        <span className="relative grid size-8 place-items-center rounded-md text-ink-muted transition-colors duration-fast hover:bg-surface-2 hover:text-ink">
          <Bell size={17} aria-hidden="true" />
          {unread > 0 ? (
            <span
              aria-live="polite"
              className="numeric absolute -end-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-live px-1 text-[10px] font-bold leading-4 text-ink-inverse"
            >
              {unread}
            </span>
          ) : null}
        </span>
      }
    >
      <div className="flex items-center justify-between gap-2 border-b border-line-soft px-3 py-2.5">
        <p className="text-small font-semibold text-ink">{t("notifications.title")}</p>
        {unread > 0 ? (
          <button
            type="button"
            onClick={() => {
              setReadIds(notifications.map((notification) => notification.id));
              void markAllNotificationsReadAction();
            }}
            className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-caption normal-case tracking-normal text-ink-subtle transition-colors duration-fast hover:bg-surface-3 hover:text-ink"
          >
            <CheckCheck size={12} aria-hidden="true" />
            {t("notifications.markAllRead")}
          </button>
        ) : null}
      </div>

      {notifications.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<BellOff size={18} aria-hidden="true" />}
          title={t("empty.noNotifications")}
        />
      ) : (
        <ul className="scroll-slim max-h-80 overflow-y-auto">
          {notifications.map((notification) => (
            <li key={notification.id}>
              <Link
                href={notification.href ?? "#"}
                onClick={() => {
                  setReadIds((ids) => [...ids, notification.id]);
                  if (!notification.read) void markNotificationReadAction(notification.id);
                }}
                className={cn(
                  "flex gap-2.5 border-b border-line-soft px-3 py-2.5 transition-colors duration-fast last:border-b-0 hover:bg-surface-3",
                  !isRead(notification) && "bg-primary-soft/40",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-1.5 size-1.5 shrink-0 rounded-full",
                    isRead(notification) ? "bg-transparent" : "bg-primary",
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-small font-medium text-ink">
                    {t(notification.titleKey, notification.params)}
                  </span>
                  <span className="mt-0.5 block text-caption normal-case leading-relaxed tracking-normal text-ink-muted">
                    {t(notification.bodyKey, notification.params)}
                  </span>
                  <span className="numeric mt-1 block text-caption normal-case tracking-normal text-ink-subtle">
                    {formatDateTime(notification.createdAt, locale)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-line-soft p-2">
        <Link
          href="/account/notifications"
          className="block rounded-md px-2 py-1.5 text-center text-small font-semibold text-primary transition-colors duration-fast hover:bg-surface-3"
        >
          {t("notifications.viewAll")}
        </Link>
      </div>
    </Dropdown>
  );
}
