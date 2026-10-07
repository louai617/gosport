import "server-only";

import type { LimitKind as DbKind, LimitPeriod as DbPeriod } from "@prisma/client";

import { JURISDICTION, RESPONSIBLE_GAMBLING } from "@/config/app.config";
import { fromBig, toBig, toMillimes } from "@/lib/money";
import {
  startOfZonedDay,
  startOfZonedMonth,
  startOfZonedWeek,
} from "@/lib/zonedTime";
import { prisma, transact, type DbClient } from "@/server/db";
import { AuthError, assertCanWager, requireUser } from "@/server/auth/guard";
import { notifyUser } from "@/server/notifications/notify";
import { audit } from "@/server/security/audit";
import { getSetting } from "@/server/settings/settingsService";
import type {
  ExclusionKind,
  LimitKind,
  LimitPeriod,
  ResponsibleGamblingLimit,
  SelfExclusion,
  SessionUser,
} from "@/types";
import type {
  ExclusionResult,
  LimitChangeInput,
  LimitChangeResult,
  SelfExclusionDuration,
} from "./types";

/**
 * Responsible-gambling controls — set by the player, enforced by the server.
 *
 * A limit the UI merely displays is not a limit. `assertWagerAllowed` and
 * `assertDepositAllowed` run inside every wagering and deposit path against the
 * ledger itself, so a player who bypasses the UI hits the same wall.
 *
 * The asymmetry that matters: a *tighter* limit protects the player the moment
 * they ask; a *looser* one waits out a cooling-off window, so the decision
 * cannot be made — and regretted — in the same moment.
 */

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const KIND_TO_DB: Record<LimitKind, DbKind> = {
  deposit: "DEPOSIT",
  stake: "STAKE",
  loss: "LOSS",
  single_bet: "SINGLE_BET",
};
const PERIOD_TO_DB: Record<LimitPeriod, DbPeriod> = {
  daily: "DAILY",
  weekly: "WEEKLY",
  monthly: "MONTHLY",
};

const LIMIT_ORDER: Record<LimitKind, number> = { deposit: 0, stake: 1, loss: 2, single_bet: 3 };

export function windowStart(period: DbPeriod, now = new Date()): Date {
  const tz = JURISDICTION.timezone;
  if (period === "DAILY") return startOfZonedDay(now, tz);
  if (period === "WEEKLY") return startOfZonedWeek(now, tz);
  return startOfZonedMonth(now, tz);
}

/* -------------------------------------------------------------------- usage */

/** Millimes used in the current window, from the ledger — never a stored counter. */
async function usedInWindow(
  db: DbClient,
  userId: string,
  kind: DbKind,
  since: Date,
): Promise<number> {
  if (kind === "SINGLE_BET") return 0;

  if (kind === "DEPOSIT") {
    const sum = await db.transaction.aggregate({
      where: { userId, type: "DEPOSIT", status: "COMPLETED", createdAt: { gte: since } },
      _sum: { amount: true },
    });
    return Math.max(0, fromBig(sum._sum.amount));
  }

  if (kind === "STAKE") {
    const sum = await db.transaction.aggregate({
      where: { userId, type: "BET", createdAt: { gte: since } },
      _sum: { amount: true },
    });
    return Math.abs(fromBig(sum._sum.amount));
  }

  // LOSS — net of everything the wager ledger paid back.
  const sum = await db.transaction.aggregate({
    where: {
      userId,
      betId: { not: null },
      type: { in: ["BET", "WIN", "REFUND"] },
      createdAt: { gte: since },
    },
    _sum: { amount: true },
  });
  return Math.max(0, -fromBig(sum._sum.amount));
}

/** Applies any increase whose cooling-off window has elapsed. */
async function promoteDuePending(db: DbClient, userId: string, now: Date): Promise<void> {
  const due = await db.responsibleGamblingLimit.findMany({
    where: { userId, pendingValue: { not: null }, pendingEffectiveFrom: { lte: now } },
  });
  for (const limit of due) {
    await db.responsibleGamblingLimit.update({
      where: { id: limit.id },
      data: { value: limit.pendingValue!, pendingValue: null, pendingEffectiveFrom: null },
    });
  }
}

/* -------------------------------------------------------------------- reads */

/**
 * Reads for one user. **No authorisation here** — the callers are the player's
 * own screens (`getResponsibleGamblingLimits`) and the operator's player view
 * (`playerAdminService`, behind `rg.read`).
 */
export async function loadLimitsFor(userId: string): Promise<ResponsibleGamblingLimit[]> {
  const now = new Date();
  await promoteDuePending(prisma, userId, now);

  const rows = await prisma.responsibleGamblingLimit.findMany({
    where: { userId, active: true },
  });

  const limits = await Promise.all(
    rows.map(async (row): Promise<ResponsibleGamblingLimit> => {
      const used = await usedInWindow(prisma, userId, row.kind, windowStart(row.period, now));
      return {
        id: row.id,
        userId: row.userId,
        kind: row.kind.toLowerCase() as LimitKind,
        period: row.period.toLowerCase() as LimitPeriod,
        value: fromBig(row.value) / 1000,
        used: used / 1000,
        active: row.active,
        effectiveFrom: row.updatedAt.toISOString(),
        pendingValue: row.pendingValue === null ? null : fromBig(row.pendingValue) / 1000,
        pendingEffectiveFrom: row.pendingEffectiveFrom?.toISOString() ?? null,
      };
    }),
  );

  return limits.sort((a, b) => LIMIT_ORDER[a.kind] - LIMIT_ORDER[b.kind]);
}

export async function loadExclusionsFor(userId: string): Promise<SelfExclusion[]> {
  const rows = await prisma.selfExclusion.findMany({
    where: { userId },
    orderBy: { startedAt: "desc" },
    take: 50,
  });
  return rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    kind: row.kind === "COOLING_OFF" ? "cooling_off" : "self_exclusion",
    startedAt: row.startedAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    registeredExternally: false,
  }));
}

export async function getResponsibleGamblingLimits(): Promise<ResponsibleGamblingLimit[]> {
  const user = await requireUser();
  return loadLimitsFor(user.id);
}

export async function getSelfExclusions(): Promise<SelfExclusion[]> {
  const user = await requireUser();
  return loadExclusionsFor(user.id);
}

/* ------------------------------------------------------------------- limits */

export async function requestLimitChange(input: LimitChangeInput): Promise<LimitChangeResult> {
  const user = await requireUser();
  const now = new Date();

  const fail = (errorKey: string): LimitChangeResult => ({
    ok: false,
    errorKey,
    effect: "immediate",
    effectiveFrom: now.toISOString(),
    coolingOffHours: 0,
    messageKey: errorKey,
  });

  if (!(input.value > 0) || !Number.isFinite(input.value)) {
    return fail("responsible.validation.valueTooLow");
  }
  if (!(input.kind in KIND_TO_DB) || !(input.period in PERIOD_TO_DB)) {
    return fail("common.validation.invalid");
  }

  const kind = KIND_TO_DB[input.kind];
  const period = PERIOD_TO_DB[input.period];
  const requested = toMillimes(input.value);
  const coolingOffHours = await getSetting("responsible.limitIncreaseCoolingOffHours");

  const result = await transact(async (tx) => {
    await promoteDuePending(tx, user.id, now);
    const current = await tx.responsibleGamblingLimit.findUnique({
      where: { userId_kind_period: { userId: user.id, kind, period } },
    });

    const isIncrease = current !== null && current.active && requested > fromBig(current.value);

    if (isIncrease && coolingOffHours > 0) {
      const effectiveFrom = new Date(now.getTime() + coolingOffHours * MS_PER_HOUR);
      await tx.responsibleGamblingLimit.update({
        where: { id: current.id },
        data: { pendingValue: toBig(requested), pendingEffectiveFrom: effectiveFrom },
      });
      await audit({
        tx,
        action: "limit.increase_scheduled",
        actor: user,
        targetUserId: user.id,
        description: `${input.kind} limit increase scheduled (${coolingOffHours} h cooling-off)`,
        metadata: { kind, period, requested },
      });
      return { effect: "scheduled" as const, effectiveFrom, hours: coolingOffHours };
    }

    await tx.responsibleGamblingLimit.upsert({
      where: { userId_kind_period: { userId: user.id, kind, period } },
      create: { userId: user.id, kind, period, value: toBig(requested) },
      update: {
        value: toBig(requested),
        active: true,
        pendingValue: null,
        pendingEffectiveFrom: null,
      },
    });
    await audit({
      tx,
      action: current ? "limit.decreased" : "limit.created",
      actor: user,
      targetUserId: user.id,
      description: `${input.kind} ${input.period} limit ${current ? "changed" : "set"}`,
      metadata: { kind, period, value: requested },
    });
    return { effect: "immediate" as const, effectiveFrom: now, hours: 0 };
  });

  return {
    ok: true,
    effect: result.effect,
    effectiveFrom: result.effectiveFrom.toISOString(),
    coolingOffHours: result.hours,
    messageKey:
      result.effect === "scheduled"
        ? "responsible.limits.increaseDelayed"
        : "responsible.limits.decreaseImmediate",
  };
}

/* -------------------------------------------------------------- exclusions */

const COOLING_OFF_DAYS: readonly number[] = RESPONSIBLE_GAMBLING.coolingOffOptionsDays;
const EXCLUSION_MONTHS: readonly number[] = RESPONSIBLE_GAMBLING.selfExclusionOptionsMonths;

/** Adds calendar months, clamping to the last day so an exclusion never ends early. */
function addMonthsClamped(from: Date, months: number): Date {
  const target = new Date(from);
  const day = target.getUTCDate();
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target;
}

async function createExclusion(
  user: SessionUser,
  kind: ExclusionKind,
  endsAt: Date | null,
): Promise<ExclusionResult> {
  const row = await transact(async (tx) => {
    const created = await tx.selfExclusion.create({
      data: {
        userId: user.id,
        kind: kind === "cooling_off" ? "COOLING_OFF" : "SELF_EXCLUSION",
        endsAt,
      },
    });
    await audit({
      tx,
      action:
        kind === "cooling_off"
          ? "exclusion.cooling_off_started"
          : "exclusion.self_exclusion_started",
      actor: user,
      targetUserId: user.id,
      description: `${kind === "cooling_off" ? "Cooling-off" : "Self-exclusion"} started${
        endsAt ? ` until ${endsAt.toISOString()}` : " (permanent)"
      }`,
      metadata: { endsAt: endsAt?.toISOString() ?? null },
    });
    return created;
  });

  await notifyUser(user.id, {
    kind: "responsible_gambling",
    titleKey: "notify.exclusion.title",
    bodyKey: "notify.exclusion.body",
    href: "/account/responsible",
  });

  return {
    ok: true,
    messageKey: "responsible.exclusionStarted",
    exclusion: {
      id: row.id,
      userId: row.userId,
      kind,
      startedAt: row.startedAt.toISOString(),
      endsAt: row.endsAt?.toISOString() ?? null,
      registeredExternally: false,
    },
  };
}

export async function requestCoolingOff(days: number): Promise<ExclusionResult> {
  const user = await requireUser();
  if (!COOLING_OFF_DAYS.includes(days)) {
    return {
      ok: false,
      errorKey: "responsible.validation.durationUnsupported",
      messageKey: "responsible.validation.durationUnsupported",
    };
  }
  return createExclusion(user, "cooling_off", new Date(Date.now() + days * MS_PER_DAY));
}

/**
 * The strongest tool the account offers. It can only run its course: there is no
 * endpoint — for the player or an administrator — that ends one early.
 */
export async function requestSelfExclusion(
  duration: SelfExclusionDuration,
): Promise<ExclusionResult> {
  const user = await requireUser();
  if (duration !== "permanent" && !EXCLUSION_MONTHS.includes(duration)) {
    return {
      ok: false,
      errorKey: "responsible.validation.durationUnsupported",
      messageKey: "responsible.validation.durationUnsupported",
    };
  }
  return createExclusion(
    user,
    "self_exclusion",
    duration === "permanent" ? null : addMonthsClamped(new Date(), duration),
  );
}

/* -------------------------------------------------------------- enforcement */

function blocked(messageKey: string): never {
  throw new AuthError("compliance_blocked", messageKey);
}

/**
 * Everything that must hold before a stake is taken — for sportsbook tickets and
 * casino rounds alike. Throws `AuthError("compliance_blocked", key)`; callers map
 * that onto the API envelope.
 *
 * `stakeMillimes` is the amount about to be debited *now*.
 */
export async function assertWagerAllowed(
  user: SessionUser,
  stakeMillimes: number,
  db: DbClient = prisma,
): Promise<void> {
  assertCanWager(user);

  if (await getSetting("general.maintenanceMode")) blocked("auth.error.maintenance");

  const profile = await db.playerProfile.findUnique({
    where: { userId: user.id },
    select: { wageringBlocked: true, kycStatus: true },
  });
  if (profile?.wageringBlocked) blocked("account.error.wageringBlocked");

  if (
    (await getSetting("players.requireVerificationToWager")) &&
    profile?.kycStatus !== "VERIFIED"
  ) {
    blocked("account.error.verificationRequired");
  }

  const now = new Date();
  await promoteDuePending(db, user.id, now);
  const limits = await db.responsibleGamblingLimit.findMany({
    where: { userId: user.id, active: true },
  });

  for (const limit of limits) {
    const value = fromBig(limit.value);

    if (limit.kind === "SINGLE_BET") {
      if (stakeMillimes > value) blocked("responsible.error.singleBetLimit");
      continue;
    }

    const used = await usedInWindow(db, user.id, limit.kind, windowStart(limit.period, now));

    if (limit.kind === "STAKE" && used + stakeMillimes > value) {
      blocked("responsible.error.stakeLimit");
    }
    // Net loss plus a stake that could be lost outright must stay inside the limit.
    if (limit.kind === "LOSS" && used + stakeMillimes > value) {
      blocked("responsible.error.lossLimit");
    }
  }
}

/** Run before an operator records a DEPOSIT for the player. */
export async function assertDepositAllowed(
  userId: string,
  amountMillimes: number,
  db: DbClient = prisma,
): Promise<void> {
  const now = new Date();
  await promoteDuePending(db, userId, now);
  const limits = await db.responsibleGamblingLimit.findMany({
    where: { userId, active: true, kind: "DEPOSIT" },
  });
  for (const limit of limits) {
    const used = await usedInWindow(db, userId, "DEPOSIT", windowStart(limit.period, now));
    if (used + amountMillimes > fromBig(limit.value)) blocked("responsible.error.depositLimit");
  }
}
