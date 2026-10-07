import "server-only";

import { prisma, type DbClient } from "@/server/db";

/**
 * Notifications.
 *
 * Every notification is first a row in `Notification` — that is the in-app
 * channel, and it is always on. External channels (e-mail, SMS, Telegram) plug
 * in through `registerChannel` and are given each notification *after* the row
 * is stored, best-effort: a provider outage must never roll back, delay or fail
 * the business operation that caused the notification.
 *
 * No external channel is shipped, because none is configured. The interface is
 * the deliverable: adding one is a file that implements `NotificationChannel`
 * and a `registerChannel` call at boot — nothing in the core changes.
 */

export type NotificationKind =
  | "account"
  | "bet_settled"
  | "promotion"
  | "responsible_gambling"
  | "transaction"
  | "new_player"
  | "withdrawal_request"
  | "approval_request"
  | "security"
  | "admin_action"
  | "match_starting";

export interface NotificationInput {
  kind: NotificationKind;
  /** i18n keys; `params` is interpolated at render time. */
  titleKey: string;
  bodyKey: string;
  params?: Record<string, string | number>;
  href?: string;
  /** Write inside the caller's transaction. */
  tx?: DbClient;
}

export interface DeliveredNotification extends Omit<NotificationInput, "tx"> {
  recipient: { id: string; email: string; phone: string | null; locale: string };
}

/** Contract for an external delivery channel. */
export interface NotificationChannel {
  readonly id: string;
  /** False when the provider is not configured; the channel is then skipped. */
  isConfigured(): boolean;
  deliver(notification: DeliveredNotification): Promise<void>;
}

const channels: NotificationChannel[] = [];

export function registerChannel(channel: NotificationChannel): void {
  if (!channels.some((existing) => existing.id === channel.id)) channels.push(channel);
}

export function configuredChannels(): string[] {
  return ["in_app", ...channels.filter((channel) => channel.isConfigured()).map((c) => c.id)];
}

async function fanOut(recipientIds: string[], input: NotificationInput): Promise<void> {
  if (recipientIds.length === 0) return;
  const db = input.tx ?? prisma;

  await db.notification.createMany({
    data: recipientIds.map((userId) => ({
      userId,
      kind: input.kind,
      titleKey: input.titleKey,
      bodyKey: input.bodyKey,
      params: (input.params ?? undefined) as never,
      href: input.href ?? null,
    })),
  });

  const active = channels.filter((channel) => channel.isConfigured());
  if (active.length === 0) return;

  const recipients = await db.user.findMany({
    where: { id: { in: recipientIds } },
    select: { id: true, email: true, phone: true, profile: { select: { locale: true } } },
  });

  for (const recipient of recipients) {
    for (const channel of active) {
      void channel
        .deliver({
          kind: input.kind,
          titleKey: input.titleKey,
          bodyKey: input.bodyKey,
          params: input.params,
          href: input.href,
          recipient: {
            id: recipient.id,
            email: recipient.email,
            phone: recipient.phone,
            locale: recipient.profile?.locale ?? "fr",
          },
        })
        .catch(() => undefined);
    }
  }
}

export async function notifyUser(userId: string, input: NotificationInput): Promise<void> {
  await fanOut([userId], input);
}

/** One notification per active administrator, so read state needs no join table. */
export async function notifyAdmins(
  input: NotificationInput,
  options: { exceptUserId?: string } = {},
): Promise<void> {
  const admins = await (input.tx ?? prisma).user.findMany({
    where: {
      role: "ADMIN",
      status: "ACTIVE",
      ...(options.exceptUserId ? { NOT: { id: options.exceptUserId } } : {}),
    },
    select: { id: true },
  });
  await fanOut(
    admins.map((admin) => admin.id),
    input,
  );
}
