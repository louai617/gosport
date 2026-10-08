import "server-only";

import type { KycStatus, Prisma, UserStatus } from "@prisma/client";

import { fromBig } from "@/lib/money";
import { prisma, transact, type Tx } from "@/server/db";
import { AuthError, requirePermission } from "@/server/auth/guard";
import { managedManagerWhere, managedPlayerWhere } from "@/server/auth/scope";
import { revokeAllSessions } from "@/server/auth/session";
import { effectiveStatus } from "@/server/auth/sessionUser";
import { audit } from "@/server/security/audit";
import {
  clampPage,
  cleanSearch,
  containsCI,
  type SortDirection,
} from "@/server/repositories/filters";
import type { AccountStatus, KycStatus as KycView, Paginated } from "@/types";
import type { SessionUser } from "@/types/user";
import { loadExclusionsFor, loadLimitsFor } from "./responsibleService";

/**
 * Operator player management.
 *
 * Every function starts with `requirePermission(...)` — the layout hiding a page
 * is a convenience, this is the authority. The target is always looked up by id
 * *through the actor's scope* (`managedPlayerWhere`): a superadmin reaches every
 * player, a manager only the players they created, and a guessed id outside that
 * is simply "not found". Staff accounts are never reachable through these paths.
 *
 * What an operator can never obtain: a password hash or a session token, or any
 * existing password. A credential is only ever *replaced* with a freshly
 * generated one, shown once (`accountService.resetCredentials`).
 */

export interface PlayerRow {
  id: string;
  username: string;
  displayName: string;
  /** The manager who created (and sells credit to) this player. */
  managerId: string | null;
  managerUsername: string | null;
  status: AccountStatus;
  kycStatus: KycView;
  balance: number;
  wageringBlocked: boolean;
  withdrawalsBlocked: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface PlayerListQuery {
  search?: string;
  status?: AccountStatus;
  kycStatus?: KycView;
  restricted?: boolean;
  /** Superadmin only: restrict to one manager's players. A manager is always restricted to their own. */
  manager?: string;
  from?: Date;
  to?: Date;
  page?: number;
  pageSize?: number;
  sort?: string;
  direction?: SortDirection;
}

const STATUS_TO_DB: Record<AccountStatus, UserStatus> = {
  pending: "PENDING",
  active: "ACTIVE",
  suspended: "SUSPENDED",
  locked: "LOCKED",
  self_excluded: "SELF_EXCLUDED",
  closed: "CLOSED",
};

const playerInclude = (now: Date) =>
  ({
    profile: true,
    wallet: { select: { balance: true } },
    createdBy: { select: { username: true } },
    exclusions: {
      where: { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      select: { id: true },
      take: 1,
    },
  }) satisfies Prisma.UserInclude;

type PlayerDbRow = Prisma.UserGetPayload<{ include: ReturnType<typeof playerInclude> }>;

function toPlayerRow(row: PlayerDbRow): PlayerRow {
  return {
    id: row.id,
    username: row.username,
    displayName: row.profile?.displayName ?? row.username,
    managerId: row.createdById,
    managerUsername: row.createdBy?.username ?? null,
    status: effectiveStatus(row),
    kycStatus: (row.profile?.kycStatus.toLowerCase() ?? "not_started") as KycView,
    balance: fromBig(row.wallet?.balance) / 1000,
    wageringBlocked: row.profile?.wageringBlocked ?? false,
    withdrawalsBlocked: row.profile?.withdrawalsBlocked ?? false,
    createdAt: row.createdAt.toISOString(),
    lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
  };
}

/* ------------------------------------------------------------------- list */

export async function listPlayers(query: PlayerListQuery = {}): Promise<Paginated<PlayerRow>> {
  const actor = await requirePermission("players.read");

  const now = new Date();
  const and: Prisma.UserWhereInput[] = [managedPlayerWhere(actor)];

  const search = cleanSearch(query.search);
  if (search) {
    and.push({
      OR: [
        { id: search },
        { username: containsCI(search) },
        { profile: { displayName: containsCI(search) } },
        ...(actor.role === "superadmin" ? [{ createdBy: { username: containsCI(search) } }] : []),
      ],
    });
  }

  if (query.status === "self_excluded") {
    and.push({
      OR: [
        { status: "SELF_EXCLUDED" },
        { status: "ACTIVE", exclusions: { some: { OR: [{ endsAt: null }, { endsAt: { gt: now } }] } } },
      ],
    });
  } else if (query.status) {
    and.push({ status: STATUS_TO_DB[query.status] });
  }

  if (query.kycStatus) {
    and.push({ profile: { kycStatus: query.kycStatus.toUpperCase() as KycStatus } });
  }
  if (query.manager && actor.role === "superadmin") and.push({ createdById: query.manager });
  if (query.restricted) {
    and.push({ profile: { OR: [{ wageringBlocked: true }, { withdrawalsBlocked: true }] } });
  }
  if (query.from || query.to) {
    and.push({
      createdAt: { ...(query.from ? { gte: query.from } : {}), ...(query.to ? { lte: query.to } : {}) },
    });
  }

  const where: Prisma.UserWhereInput = { AND: and };
  const direction = query.direction ?? "desc";
  const orderBy: Prisma.UserOrderByWithRelationInput[] = [
    query.sort === "username"
      ? { username: direction }
      : query.sort === "lastLoginAt"
        ? { lastLoginAt: { sort: direction, nulls: "last" } }
        : query.sort === "balance"
          ? { wallet: { balance: direction } }
          : query.sort === "status"
            ? { status: direction }
            : { createdAt: direction },
    { id: "desc" },
  ];

  const { page, pageSize, skip, take } = clampPage(query.page, query.pageSize);
  const [rows, total] = await Promise.all([
    prisma.user.findMany({ where, include: playerInclude(now), orderBy, skip, take }),
    prisma.user.count({ where }),
  ]);

  return {
    items: rows.map(toPlayerRow),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/* ----------------------------------------------------------------- detail */

export interface PlayerDetail extends PlayerRow {
  firstName: string;
  lastName: string;
  countryCode: string;
  locale: string;
  dateOfBirth: string | null;
  ageDeclaredAt: string | null;
  termsAcceptedAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  restrictionReason: string | null;
  failedLoginCount: number;
  lockedUntil: string | null;
  mustChangePassword: boolean;
  createdBy: string | null;
  activeSessions: number;
}

export async function getPlayerDetail(id: string): Promise<PlayerDetail | null> {
  const actor = await requirePermission("players.read");
  const now = new Date();

  const row = await prisma.user.findFirst({
    where: { id, ...managedPlayerWhere(actor) },
    include: playerInclude(now),
  });
  if (!row) return null;

  const [creator, sessions] = await Promise.all([
    row.createdById
      ? prisma.user.findUnique({ where: { id: row.createdById }, select: { username: true } })
      : null,
    prisma.session.count({
      where: { userId: id, revokedAt: null, idleExpiresAt: { gt: now }, absoluteExpiresAt: { gt: now } },
    }),
  ]);

  const profile = row.profile;
  return {
    ...toPlayerRow(row),
    firstName: profile?.firstName ?? "",
    lastName: profile?.lastName ?? "",
    countryCode: profile?.countryCode ?? "TN",
    locale: profile?.locale ?? "fr",
    dateOfBirth: profile?.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    ageDeclaredAt: profile?.ageDeclaredAt?.toISOString() ?? null,
    termsAcceptedAt: profile?.termsAcceptedAt?.toISOString() ?? null,
    suspendedAt: row.suspendedAt?.toISOString() ?? null,
    suspendedReason: row.suspendedReason,
    restrictionReason: profile?.restrictionReason ?? null,
    failedLoginCount: row.failedLoginCount,
    lockedUntil: row.lockedUntil && row.lockedUntil > now ? row.lockedUntil.toISOString() : null,
    mustChangePassword: row.mustChangePassword,
    createdBy: creator?.username ?? null,
    activeSessions: sessions,
  };
}

export async function getPlayerResponsibleGaming(id: string) {
  await requirePermission("rg.read");
  const [limits, exclusions] = await Promise.all([loadLimitsFor(id), loadExclusionsFor(id)]);
  return { limits, exclusions };
}

/* ------------------------------------------------------------------- edit */

export interface PlayerActionResult {
  ok: boolean;
  errorKey?: string;
  fieldErrors?: Record<string, string>;
  /** One-time link produced by `createResetLink`. */
  link?: string;
}

export type ManagedKind = "player" | "manager";

/** The one door to an account: found only if it is inside the actor's scope. */
export async function requireManagedAccount(
  actor: SessionUser,
  accountId: string,
  kind: ManagedKind = "player",
  tx: Tx | typeof prisma = prisma,
) {
  const where = kind === "player" ? managedPlayerWhere(actor) : managedManagerWhere(actor);
  const account = await tx.user.findFirst({
    where: { id: accountId, ...where },
    include: { profile: true },
  });
  if (!account) throw new AuthError("forbidden", "admin.players.error.notFound");
  return account;
}

const requirePlayer = (actor: SessionUser, playerId: string, tx: Tx | typeof prisma = prisma) =>
  requireManagedAccount(actor, playerId, "player", tx);

/* ----------------------------------------------------------- status changes */

export async function changeStatus(
  playerId: string,
  to: "SUSPENDED" | "LOCKED" | "ACTIVE",
  reason: string,
  permission: "players.suspend" | "players.lock" | "managers.update",
  kind: ManagedKind = "player",
): Promise<PlayerActionResult> {
  const actor = await requirePermission(permission);
  const player = await requireManagedAccount(actor, playerId, kind);

  const from = player.status;
  const allowed: Record<typeof to, UserStatus[]> = {
    SUSPENDED: ["ACTIVE", "LOCKED", "SELF_EXCLUDED"],
    LOCKED: ["ACTIVE", "SELF_EXCLUDED"],
    ACTIVE: ["SUSPENDED", "LOCKED"],
  };
  if (!allowed[to].includes(from)) return { ok: false, errorKey: "admin.players.error.invalidTransition" };

  const action =
    to === "SUSPENDED"
      ? "admin.player.suspended"
      : to === "LOCKED"
        ? "admin.player.locked"
        : from === "LOCKED"
          ? "admin.player.unlocked"
          : "admin.player.reactivated";

  await transact(async (tx) => {
    await tx.user.update({
      where: { id: player.id },
      data:
        to === "ACTIVE"
          ? {
              status: "ACTIVE",
              suspendedAt: null,
              suspendedReason: null,
              lockedUntil: null,
              failedLoginCount: 0,
            }
          : {
              status: to,
              suspendedAt: new Date(),
              suspendedReason: reason,
            },
    });
    await audit({
      tx,
      action,
      actor,
      targetUserId: player.id,
      targetType: "user",
      targetId: player.id,
      description: `${player.username}: ${from} → ${to}. ${reason}`,
      metadata: { from, to, reason },
    });
  });

  // A suspension that leaves existing sessions alive is not a suspension.
  if (to !== "ACTIVE") await revokeAllSessions(player.id, { reason: `admin_${to.toLowerCase()}` });
  return { ok: true };
}

export const suspendPlayer = (playerId: string, reason: string) =>
  changeStatus(playerId, "SUSPENDED", reason, "players.suspend");
export const lockPlayer = (playerId: string, reason: string) =>
  changeStatus(playerId, "LOCKED", reason, "players.lock");
export const reactivatePlayer = (playerId: string, reason: string) =>
  changeStatus(playerId, "ACTIVE", reason, "players.suspend");

export async function setPlayerRestrictions(input: {
  playerId: string;
  wageringBlocked: boolean;
  withdrawalsBlocked: boolean;
  reason: string;
}): Promise<PlayerActionResult> {
  const actor = await requirePermission("players.update");
  const player = await requirePlayer(actor, input.playerId);

  await transact(async (tx) => {
    await tx.playerProfile.update({
      where: { userId: player.id },
      data: {
        wageringBlocked: input.wageringBlocked,
        withdrawalsBlocked: input.withdrawalsBlocked,
        restrictionReason: input.wageringBlocked || input.withdrawalsBlocked ? input.reason : null,
        restrictedAt: input.wageringBlocked || input.withdrawalsBlocked ? new Date() : null,
      },
    });
    await audit({
      tx,
      action: "admin.player.restrictions_changed",
      actor,
      targetUserId: player.id,
      targetType: "user",
      targetId: player.id,
      description: `${player.username}: wagering ${input.wageringBlocked ? "blocked" : "allowed"}, withdrawals ${input.withdrawalsBlocked ? "blocked" : "allowed"}. ${input.reason}`,
      metadata: {
        before: {
          wageringBlocked: player.profile?.wageringBlocked,
          withdrawalsBlocked: player.profile?.withdrawalsBlocked,
        },
        after: { wageringBlocked: input.wageringBlocked, withdrawalsBlocked: input.withdrawalsBlocked },
        reason: input.reason,
      },
    });
  });
  return { ok: true };
}

/**
 * A manual verification decision. No provider is connected, so this records the
 * operator's own review of documents held elsewhere — it is audited with the
 * reason and does not pretend to be an automated check.
 */
export async function setPlayerVerification(input: {
  playerId: string;
  status: KycStatus;
  reason: string;
}): Promise<PlayerActionResult> {
  const actor = await requirePermission("players.update");
  const player = await requirePlayer(actor, input.playerId);

  await transact(async (tx) => {
    await tx.playerProfile.update({ where: { userId: player.id }, data: { kycStatus: input.status } });
    await audit({
      tx,
      action: "admin.player.verification_changed",
      actor,
      targetUserId: player.id,
      targetType: "user",
      targetId: player.id,
      description: `${player.username}: verification ${player.profile?.kycStatus} → ${input.status}. ${input.reason}`,
      metadata: { from: player.profile?.kycStatus, to: input.status, reason: input.reason },
    });
  });
  return { ok: true };
}

/* ------------------------------------------------------ credentials & sessions */

export async function revokePlayerSessions(playerId: string): Promise<PlayerActionResult & { revoked?: number }> {
  const actor = await requirePermission("players.sessions.revoke");
  const player = await requirePlayer(actor, playerId);
  const revoked = await revokeAllSessions(player.id, { reason: "admin_revoked" });
  await audit({
    action: "admin.player.sessions_revoked",
    actor,
    targetUserId: player.id,
    targetType: "user",
    targetId: player.id,
    description: `Revoked ${revoked} session(s) for ${player.username}`,
    metadata: { revoked },
  });
  return { ok: true, revoked };
}

/* ------------------------------------------------------------------ activity */

export interface PlayerActivityRow {
  id: string;
  createdAt: string;
  action: string;
  severity: "info" | "warning" | "critical";
  outcome: "success" | "failure" | "blocked";
  description: string;
  actorUsername: string | null;
  ip: string | null;
}

/** Account activity: sign-ins, sign-outs, credential and administrative changes. */
export async function getPlayerActivity(
  playerId: string,
  page = 1,
  pageSize = 25,
): Promise<Paginated<PlayerActivityRow>> {
  await requirePermission("audit.read");
  const { skip, take, page: current, pageSize: size } = clampPage(page, pageSize);
  const where: Prisma.AuditLogWhereInput = { OR: [{ targetUserId: playerId }, { actorId: playerId }] };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { actor: { select: { username: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      action: row.action,
      severity: row.severity.toLowerCase() as PlayerActivityRow["severity"],
      outcome: row.outcome.toLowerCase() as PlayerActivityRow["outcome"],
      description: row.description,
      actorUsername: row.actor?.username ?? null,
      ip: row.ip,
    })),
    page: current,
    pageSize: size,
    total,
    totalPages: Math.max(1, Math.ceil(total / size)),
  };
}

