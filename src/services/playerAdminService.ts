import "server-only";

import { randomBytes } from "node:crypto";

import type { KycStatus, Prisma, UserStatus } from "@prisma/client";

import type {
  CreatePlayerInput,
  UpdatePlayerInput,
} from "@/lib/adminValidation";
import { fromBig } from "@/lib/money";
import { isUniqueViolation, prisma, transact, type Tx } from "@/server/db";
import { AuthError, requirePermission } from "@/server/auth/guard";
import { createHasher } from "@/server/auth/password";
import { revokeAllSessions } from "@/server/auth/session";
import { effectiveStatus } from "@/server/auth/sessionUser";
import { sendSecureLink } from "@/server/notifications/transport";
import { audit } from "@/server/security/audit";
import {
  clampPage,
  cleanSearch,
  containsCI,
  type SortDirection,
} from "@/server/repositories/filters";
import { ensureWallet } from "@/server/wallet/ledger";
import type { AccountStatus, KycStatus as KycView, Paginated } from "@/types";
import { INVITATION_TTL_MS, issuePasswordToken, passwordLink, passwordPolicyError } from "./authService";
import { loadExclusionsFor, loadLimitsFor } from "./responsibleService";

/**
 * Operator player management.
 *
 * Every function starts with `requirePermission(...)` — the layout hiding a page
 * is a convenience, this is the authority. The target is always looked up by id
 * *and* required to be a PLAYER: an administrator cannot suspend, edit or credit
 * another administrator through these paths.
 *
 * What an operator can never obtain: a password, a password hash, or a session
 * token. Credentials are only ever *replaced* (a one-time link, or a temporary
 * password the operator themselves chose), never revealed.
 */

export interface PlayerRow {
  id: string;
  username: string;
  email: string;
  phone: string | null;
  displayName: string;
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
    email: row.email,
    phone: row.phone,
    displayName: row.profile?.displayName ?? row.username,
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
  await requirePermission("players.read");

  const now = new Date();
  const and: Prisma.UserWhereInput[] = [{ role: "PLAYER" }];

  const search = cleanSearch(query.search);
  if (search) {
    and.push({
      OR: [
        { id: search },
        { username: containsCI(search) },
        { email: containsCI(search) },
        { phone: containsCI(search) },
        { profile: { displayName: containsCI(search) } },
        { profile: { lastName: containsCI(search) } },
        { profile: { firstName: containsCI(search) } },
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
      : query.sort === "email"
        ? { email: direction }
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
  emailVerifiedAt: string | null;
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
  await requirePermission("players.read");
  const now = new Date();

  const row = await prisma.user.findFirst({
    where: { id, role: "PLAYER" },
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
    emailVerifiedAt: row.emailVerifiedAt?.toISOString() ?? null,
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

/* ----------------------------------------------------------------- create */

export interface CreatePlayerResult {
  ok: boolean;
  errorKey?: string;
  fieldErrors?: Record<string, string>;
  playerId?: string;
  username?: string;
  /** One-time link, shown to the operator once. Never stored in the clear. */
  invitationLink?: string;
  delivered?: boolean;
}

export async function createPlayer(input: CreatePlayerInput): Promise<CreatePlayerResult> {
  const actor = await requirePermission("players.create");

  const taken = await prisma.user.findFirst({
    where: { OR: [{ email: input.email }, { username: input.username }] },
    select: { email: true, username: true },
  });
  if (taken) {
    const fieldErrors: Record<string, string> = {};
    if (taken.email === input.email) fieldErrors.email = "auth.validation.emailTaken";
    if (taken.username === input.username) fieldErrors.username = "auth.validation.usernameTaken";
    return { ok: false, errorKey: "common.error.checkFields", fieldErrors };
  }

  const hasher = createHasher();
  let passwordHash: string;
  let status: UserStatus;
  let mustChange = false;

  if (input.credentialMode === "password") {
    const policy = await passwordPolicyError(input.temporaryPassword ?? "");
    if (policy) {
      return { ok: false, errorKey: policy, fieldErrors: { temporaryPassword: policy } };
    }
    passwordHash = await hasher.hash(input.temporaryPassword!);
    status = "ACTIVE";
    // The operator chose this password, so it is spent the moment the player signs in.
    mustChange = true;
  } else {
    // An unguessable placeholder: the account cannot be signed into until the
    // invitation is accepted and a real password is set.
    passwordHash = await hasher.hash(randomBytes(32).toString("base64url"));
    status = "PENDING";
  }

  try {
    const created = await transact(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: input.username,
          email: input.email,
          phone: input.phone,
          passwordHash,
          role: "PLAYER",
          status,
          mustChangePassword: mustChange,
          createdById: actor.id,
          profile: {
            create: {
              displayName: `${input.firstName} ${input.lastName.charAt(0)}.`,
              firstName: input.firstName,
              lastName: input.lastName,
              countryCode: input.country,
              locale: input.locale,
            },
          },
        },
      });
      await ensureWallet(tx, user.id);

      const token =
        input.credentialMode === "invitation"
          ? await issuePasswordToken(tx, {
              userId: user.id,
              purpose: "INVITATION",
              ttlMs: INVITATION_TTL_MS,
              createdById: actor.id,
            })
          : null;

      await audit({
        tx,
        action: "admin.player.created",
        actor,
        targetUserId: user.id,
        targetType: "user",
        targetId: user.id,
        description: `Created player ${user.username} (${input.credentialMode === "invitation" ? "invitation" : "temporary password"})`,
        metadata: { credentialMode: input.credentialMode, initialStatus: status },
      });
      return { user, token };
    });

    let delivered = false;
    let link: string | undefined;
    if (created.token) {
      link = passwordLink(created.token);
      const delivery = await sendSecureLink({
        kind: "invitation",
        to: { email: created.user.email, phone: created.user.phone },
        link,
      });
      delivered = delivery.delivered;
    }

    return {
      ok: true,
      playerId: created.user.id,
      username: created.user.username,
      invitationLink: link,
      delivered,
    };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, errorKey: "auth.error.registrationConflict" };
    throw error;
  }
}

/* ------------------------------------------------------------------- edit */

export interface PlayerActionResult {
  ok: boolean;
  errorKey?: string;
  fieldErrors?: Record<string, string>;
  /** One-time link produced by `createResetLink`. */
  link?: string;
}

async function requirePlayer(playerId: string, tx: Tx | typeof prisma = prisma) {
  const player = await tx.user.findFirst({
    where: { id: playerId, role: "PLAYER" },
    include: { profile: true },
  });
  if (!player) throw new AuthError("forbidden", "admin.players.error.notFound");
  return player;
}

export async function updatePlayer(input: UpdatePlayerInput): Promise<PlayerActionResult> {
  const actor = await requirePermission("players.update");
  const player = await requirePlayer(input.playerId);

  if (input.email !== player.email) {
    const clash = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } });
    if (clash && clash.id !== player.id) {
      return { ok: false, errorKey: "common.error.checkFields", fieldErrors: { email: "auth.validation.emailTaken" } };
    }
  }

  const before = {
    email: player.email,
    phone: player.phone,
    firstName: player.profile?.firstName,
    lastName: player.profile?.lastName,
    displayName: player.profile?.displayName,
    country: player.profile?.countryCode,
    locale: player.profile?.locale,
  };
  const after = {
    email: input.email,
    phone: input.phone ?? null,
    firstName: input.firstName,
    lastName: input.lastName,
    displayName: input.displayName,
    country: input.country,
    locale: input.locale,
  };
  const changed = Object.keys(after).filter(
    (key) => (before as Record<string, unknown>)[key] !== (after as Record<string, unknown>)[key],
  );
  if (changed.length === 0) return { ok: true };

  try {
    await transact(async (tx) => {
      await tx.user.update({
        where: { id: player.id },
        data: {
          email: input.email,
          phone: input.phone ?? null,
          // A changed address is unproven until its owner uses it.
          ...(input.email !== player.email ? { emailVerifiedAt: null } : {}),
          profile: {
            update: {
              firstName: input.firstName,
              lastName: input.lastName,
              displayName: input.displayName,
              countryCode: input.country,
              locale: input.locale,
            },
          },
        },
      });
      await audit({
        tx,
        action: "admin.player.updated",
        actor,
        targetUserId: player.id,
        targetType: "user",
        targetId: player.id,
        description: `Updated ${changed.join(", ")} for ${player.username}: ${input.reason}`,
        metadata: { changed, before, after, reason: input.reason },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, errorKey: "common.error.checkFields", fieldErrors: { email: "auth.validation.emailTaken" } };
    }
    throw error;
  }
  return { ok: true };
}

/* ----------------------------------------------------------- status changes */

async function changeStatus(
  playerId: string,
  to: "SUSPENDED" | "LOCKED" | "ACTIVE",
  reason: string,
  permission: "players.suspend" | "players.lock",
): Promise<PlayerActionResult> {
  const actor = await requirePermission(permission);
  const player = await requirePlayer(playerId);

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
  const player = await requirePlayer(input.playerId);

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
  const player = await requirePlayer(input.playerId);

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
  const player = await requirePlayer(playerId);
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

/**
 * Issues a one-time link the operator hands to the player (an invitation for a
 * `PENDING` account, a reset for anyone else). The operator sees the link once;
 * what is stored is its HMAC, and following it makes the *player* choose a
 * password. Existing sessions are not touched until they do.
 */
export async function createCredentialLink(playerId: string): Promise<PlayerActionResult> {
  const actor = await requirePermission("players.credentials");
  const player = await requirePlayer(playerId);

  if (player.status === "CLOSED") return { ok: false, errorKey: "admin.players.error.invalidTransition" };

  const purpose = player.status === "PENDING" ? "INVITATION" : "PASSWORD_RESET";
  const ttl = purpose === "INVITATION" ? INVITATION_TTL_MS : 24 * 3600 * 1000;

  const token = await transact(async (tx) => {
    const issued = await issuePasswordToken(tx, {
      userId: player.id,
      purpose,
      ttlMs: ttl,
      createdById: actor.id,
    });
    await audit({
      tx,
      action: purpose === "INVITATION" ? "admin.player.invitation_created" : "admin.player.reset_link_created",
      actor,
      targetUserId: player.id,
      targetType: "user",
      targetId: player.id,
      description: `Issued a one-time ${purpose === "INVITATION" ? "invitation" : "password reset"} link for ${player.username}`,
    });
    return issued;
  });

  return { ok: true, link: passwordLink(token) };
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

