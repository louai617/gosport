import "server-only";

import type { Prisma } from "@prisma/client";

import type { AccountStatus, SessionUser } from "@/types/user";

/**
 * Prisma rows ⇄ the narrow `SessionUser` the rest of the app sees.
 *
 * `SessionUser` is deliberately small so a session payload never carries a date
 * of birth, a phone number or a password hash around the app.
 */

/** Everything `toSessionUser` needs, in one query. */
export function sessionUserInclude(now: Date) {
  return {
    profile: true,
    // Whether any exclusion is currently in force — an active cooling-off or
    // self-exclusion makes the *effective* status `self_excluded` even though
    // `User.status` is still ACTIVE.
    exclusions: {
      where: { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      select: { id: true },
      take: 1,
    },
  } satisfies Prisma.UserInclude;
}

export type SessionUserRow = Prisma.UserGetPayload<{
  include: ReturnType<typeof sessionUserInclude>;
}>;

export function effectiveStatus(row: {
  status: string;
  exclusions?: Array<unknown>;
}): AccountStatus {
  const base = row.status.toLowerCase() as AccountStatus;
  return base === "active" && (row.exclusions?.length ?? 0) > 0 ? "self_excluded" : base;
}

export function toSessionUser(row: SessionUserRow): SessionUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    displayName: row.profile?.displayName ?? row.username,
    firstName: row.profile?.firstName ?? "",
    lastName: row.profile?.lastName ?? "",
    role: row.role === "ADMIN" ? "admin" : "player",
    status: effectiveStatus(row),
    kycStatus: (row.profile?.kycStatus.toLowerCase() ?? "not_started") as SessionUser["kycStatus"],
    locale: row.profile?.locale ?? "fr",
    mustChangePassword: row.mustChangePassword,
  };
}

/** Statuses that may hold a session at all. */
const SESSION_STATUSES: ReadonlySet<AccountStatus> = new Set(["active", "self_excluded"]);

export function canHoldSession(status: AccountStatus): boolean {
  return SESSION_STATUSES.has(status);
}
