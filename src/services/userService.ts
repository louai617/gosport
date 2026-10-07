import "server-only";

import { JURISDICTION } from "@/config/app.config";
import { prisma } from "@/server/db";
import { getSessionUser, requireUser } from "@/server/auth/guard";
import { audit } from "@/server/security/audit";
import type { Favorite, FavoriteKind, SessionUser, User } from "@/types";
import { getBets } from "./bettingService";
import { walletSnapshot, getTransactions } from "./paymentService";
import { getUnreadNotificationCount } from "./notificationService";
import type { AccountOverview, ActionResult } from "./types";
import { isUniqueViolation } from "@/server/db";
import { ownProfileSchema } from "@/lib/validation";

/**
 * The signed-in player's own account.
 *
 * Authentication itself lives in `authService`; responsible-gambling controls in
 * `responsibleService`; wallet in `paymentService`. This module is what is left:
 * who the player is, their overview, and their preferences. Every function takes
 * the user from the session — none accepts a user id.
 */

/** The signed-in user, or `null` when signed out. Never throws. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  return getSessionUser();
}

/**
 * The full profile record. `SessionUser` is deliberately narrow, so a session
 * payload never carries a date of birth or a phone number around the app; only
 * the profile and security screens ask for the whole thing.
 */
export async function getUserProfile(): Promise<User> {
  const user = await requireUser({ allowPasswordChangePending: true });

  const row = await prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    include: { profile: true },
  });

  return {
    id: row.id,
    username: row.username,
    displayName: row.profile?.displayName ?? row.username,
    email: row.email,
    firstName: row.profile?.firstName ?? "",
    lastName: row.profile?.lastName ?? "",
    phone: row.phone ?? "",
    dateOfBirth: row.profile?.dateOfBirth?.toISOString().slice(0, 10) ?? "",
    countryCode: row.profile?.countryCode ?? JURISDICTION.code,
    role: row.role === "ADMIN" ? "admin" : "player",
    status: user.status,
    kycStatus: user.kycStatus,
    ageDeclaredAt: row.profile?.ageDeclaredAt?.toISOString() ?? null,
    locale: row.profile?.locale ?? "fr",
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
    twoFactorEnabled: false,
    emailVerified: row.emailVerifiedAt !== null,
    phoneVerified: false,
  };
}

export async function getAccountOverview(): Promise<AccountOverview> {
  const user = await requireUser();

  const [wallet, recent, openCount, totalCount, wonCount, transactions, unread] = await Promise.all([
    walletSnapshot(user.id),
    getBets({ pageSize: 5 }),
    prisma.bet.count({ where: { userId: user.id, status: "OPEN" } }),
    prisma.bet.count({ where: { userId: user.id } }),
    prisma.bet.count({ where: { userId: user.id, status: "WON" } }),
    getTransactions({ pageSize: 5 }),
    getUnreadNotificationCount(),
  ]);

  return {
    user,
    wallet,
    openBetCount: openCount,
    totalBetCount: totalCount,
    wonBetCount: wonCount,
    recentBets: recent.items,
    recentTransactions: transactions.items,
    unreadNotifications: unread,
  };
}

/* ----------------------------------------------------------------- profile */

export interface ProfileUpdateResult extends ActionResult {
  fieldErrors?: Record<string, string>;
}

/**
 * What a player may change about themselves: phone and display name. Name,
 * date of birth and e-mail are identity data; changing them is an operator
 * decision with a reason on the record, not a form field.
 */
export async function updateOwnProfile(input: unknown): Promise<ProfileUpdateResult> {
  const user = await requireUser();

  const parsed = ownProfileSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === "string" && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { ok: false, errorKey: "common.error.checkFields", fieldErrors };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      phone: parsed.data.phone,
      profile: { update: { displayName: parsed.data.displayName } },
    },
  });
  await audit({
    action: "player.profile_updated",
    actor: user,
    targetUserId: user.id,
    description: `${user.username} updated their phone and display name`,
  });
  return { ok: true };
}

/* --------------------------------------------------------------- favourites */

export async function getFavorites(): Promise<Favorite[]> {
  const user = await getSessionUser();
  if (!user) return [];

  const rows = await prisma.favorite.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    kind: row.kind as FavoriteKind,
    targetId: row.targetId,
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function toggleFavorite(
  kind: FavoriteKind,
  targetId: string,
): Promise<ActionResult & { favorited: boolean }> {
  const user = await requireUser();
  const where = { userId_kind_targetId: { userId: user.id, kind, targetId } };

  const existing = await prisma.favorite.findUnique({ where });
  if (existing) {
    await prisma.favorite.delete({ where });
    return { ok: true, favorited: false };
  }

  try {
    await prisma.favorite.create({ data: { userId: user.id, kind, targetId } });
  } catch (error) {
    // A concurrent toggle already created it — the end state is the same.
    if (!isUniqueViolation(error)) throw error;
  }
  return { ok: true, favorited: true };
}
