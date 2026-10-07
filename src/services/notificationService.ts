import "server-only";

import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth/guard";
import type { AppNotification, NotificationKind } from "@/types";
import type { ActionResult, NotificationQuery } from "./types";

/**
 * The signed-in user's notifications — a player's account events or an
 * administrator's operational alerts. Both read the same table; recipients are
 * fixed by the session, so there is no way to read someone else's.
 */

function toNotification(row: {
  id: string;
  userId: string;
  kind: string;
  titleKey: string;
  bodyKey: string;
  params: unknown;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
}): AppNotification {
  return {
    id: row.id,
    userId: row.userId,
    kind: row.kind as NotificationKind,
    titleKey: row.titleKey,
    bodyKey: row.bodyKey,
    params: (row.params ?? undefined) as AppNotification["params"],
    href: row.href ?? undefined,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getNotifications(query: NotificationQuery = {}): Promise<AppNotification[]> {
  const user = await requireUser({ allowPasswordChangePending: true });
  const kinds = Array.isArray(query.kind) ? query.kind : query.kind ? [query.kind] : [];

  const rows = await prisma.notification.findMany({
    where: {
      userId: user.id,
      ...(kinds.length ? { kind: { in: kinds } } : {}),
      ...(query.unreadOnly ? { readAt: null } : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(query.limit ?? 50, 1), 200),
  });
  return rows.map(toNotification);
}

export async function getUnreadNotificationCount(): Promise<number> {
  const user = await requireUser({ allowPasswordChangePending: true });
  return prisma.notification.count({ where: { userId: user.id, readAt: null } });
}

export async function markNotificationRead(id: string): Promise<ActionResult> {
  const user = await requireUser({ allowPasswordChangePending: true });
  // Scoped by userId in the update itself: another user's id matches nothing.
  const result = await prisma.notification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  if (result.count === 0) {
    const exists = await prisma.notification.count({ where: { id, userId: user.id } });
    if (exists === 0) return { ok: false, errorKey: "error.generic" };
  }
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const user = await requireUser({ allowPasswordChangePending: true });
  await prisma.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  return { ok: true };
}
