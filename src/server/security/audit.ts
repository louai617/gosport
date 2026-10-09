import "server-only";

import { headers } from "next/headers";

import { prisma, type DbClient } from "@/server/db";
import { env, isDemo } from "@/server/env";
import { roleToDb } from "@/server/auth/roles";
import { redact } from "@/server/security/redact";
import type { UserRole } from "@/types/user";

export { redact, hashEmail, maskPhone } from "@/server/security/redact";

/**
 * Audit trail.
 *
 * A regulator does not ask whether the product worked; it asks who did what,
 * when, from where, and whether the record could have been altered afterwards.
 *
 * Two sinks, deliberately:
 *
 *  - **stdout** — every event, as one JSON line, for log aggregation.
 *  - **the `AuditLog` table** — events worth investigating later (see
 *    `PERSISTED_PREFIXES`). The table is immutable at the database level: a
 *    trigger rejects UPDATE and DELETE, so "normal administrators cannot edit
 *    or delete audit records" holds even for someone with SQL access through
 *    the application's own role.
 *
 * Money-moving and account-state changes pass `tx`, so the audit row is written
 * **in the same database transaction as the change itself**. If the audit write
 * fails, the change rolls back: there is no such thing as an unaudited balance
 * movement. Informational events (a failed sign-in) are best-effort instead.
 */

export type AuditAction =
  /* authentication */
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.account_locked"
  | "auth.password_reset_completed"
  | "auth.password_changed"
  | "auth.session_revoked"
  /* player self-service */
  | "player.profile_updated"
  /* wagering (the ledger is the record; these are the operational events) */
  | "bet.placed"
  | "bet.rejected"
  | "bet.settled"
  | "bet.voided"
  /* wallet */
  | "wallet.withdrawal_requested"
  | "wallet.credit_requested"
  | "wallet.credit_request_cancelled"
  /* responsible gambling */
  | "limit.created"
  | "limit.decreased"
  | "limit.increase_scheduled"
  | "exclusion.cooling_off_started"
  | "exclusion.self_exclusion_started"
  /* operator */
  | "admin.player.created"
  | "admin.player.updated"
  | "admin.player.suspended"
  | "admin.player.reactivated"
  | "admin.player.locked"
  | "admin.player.unlocked"
  | "admin.player.restrictions_changed"
  | "admin.player.verification_changed"
  | "admin.player.sessions_revoked"
  | "admin.player.reset_link_created"
  | "admin.manager.created"
  | "admin.account.credentials_reset"
  | "admin.credit.issued"
  | "admin.credit.sold"
  | "admin.credit.request_decided"
  | "admin.wallet.adjusted"
  | "admin.wallet.adjustment_requested"
  | "admin.wallet.adjustment_approved"
  | "admin.wallet.adjustment_rejected"
  | "admin.withdrawal.approved"
  | "admin.withdrawal.rejected"
  | "admin.bet.settled"
  | "admin.settings.updated"
  | "admin.report.exported"
  /* platform */
  | "security.rate_limited"
  | "security.csrf_rejected"
  | "security.unauthorized"
  | "security.forbidden"
  | "system.error";

export type AuditOutcome = "success" | "failure" | "blocked";
export type AuditSeverity = "info" | "warning" | "critical";

/** Actions that deserve more than "info" by default. */
const SEVERITY: Partial<Record<AuditAction, AuditSeverity>> = {
  "auth.login_failed": "warning",
  "auth.account_locked": "warning",
  "auth.password_changed": "warning",
  "auth.password_reset_completed": "warning",
  "auth.session_revoked": "warning",
  "admin.player.suspended": "warning",
  "admin.player.locked": "warning",
  "admin.player.restrictions_changed": "warning",
  "admin.player.verification_changed": "warning",
  "admin.player.sessions_revoked": "warning",
  "admin.withdrawal.rejected": "warning",
  "admin.wallet.adjustment_rejected": "warning",
  "admin.settings.updated": "warning",
  "admin.report.exported": "warning",
  "security.csrf_rejected": "warning",
  "security.forbidden": "warning",
  "security.rate_limited": "warning",
  "security.unauthorized": "warning",
  "admin.wallet.adjusted": "critical",
  "admin.wallet.adjustment_approved": "critical",
  "admin.withdrawal.approved": "critical",
  "admin.player.reset_link_created": "critical",
  "admin.account.credentials_reset": "critical",
  "admin.credit.issued": "critical",
  "admin.credit.sold": "warning",
  "admin.manager.created": "warning",
  "admin.bet.settled": "critical",
  "system.error": "critical",
};

/**
 * What is persisted. Wager placement and rejected requests are high-volume and
 * already recorded by the ledger; probing noise (`unauthorized`, `rate_limited`)
 * would let an anonymous caller fill the table, so it stays on stdout only.
 */
const PERSISTED_PREFIXES = [
  "auth.",
  "player.",
  "admin.",
  "limit.",
  "exclusion.",
  "wallet.",
  "bet.settled",
  "bet.voided",
  "security.forbidden",
  "security.csrf_rejected",
  "system.error",
] as const;

export function isPersisted(action: AuditAction): boolean {
  return PERSISTED_PREFIXES.some((prefix) => action.startsWith(prefix));
}

export interface AuditActor {
  id: string;
  role: UserRole;
}

export interface AuditEvent {
  action: AuditAction;
  /** Defaults to `success`. */
  outcome?: AuditOutcome;
  severity?: AuditSeverity;
  /** Human-readable summary, in English — this is an internal record. */
  description?: string;
  /** Who performed it. Absent for anonymous and system events. */
  actor?: AuditActor | null;
  /** Legacy shape accepted from `withRoute`. */
  actorId?: string | null;
  actorRole?: UserRole | null;
  /** The player the action concerned. */
  targetUserId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  transactionId?: string | null;
  requestId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /** Free-form context. Passed through `redact()` without exception. */
  metadata?: Record<string, unknown>;
  /** Write inside the caller's transaction so the audit row commits atomically. */
  tx?: DbClient;
}

/** Pulls the caller's address, user agent and request id from the current request. */
async function requestContext(): Promise<{
  ip: string | null;
  userAgent: string | null;
  requestId: string | null;
}> {
  try {
    const h = await headers();
    const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    return {
      ip: forwarded || h.get("x-real-ip")?.trim() || null,
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
      requestId: h.get("x-request-id"),
    };
  } catch {
    // Outside a request (seed script, background job).
    return { ip: null, userAgent: null, requestId: null };
  }
}

interface Normalised {
  action: AuditAction;
  outcome: AuditOutcome;
  severity: AuditSeverity;
  description: string;
  actorId: string | null;
  actorRole: UserRole | null;
  targetUserId: string | null;
  targetType: string | null;
  targetId: string | null;
  transactionId: string | null;
  requestId: string | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | undefined;
}

async function normalise(event: AuditEvent): Promise<Normalised> {
  const context = await requestContext();
  return {
    action: event.action,
    outcome: event.outcome ?? "success",
    severity: event.severity ?? SEVERITY[event.action] ?? "info",
    description: event.description ?? event.action,
    actorId: event.actor?.id ?? event.actorId ?? null,
    actorRole: event.actor?.role ?? event.actorRole ?? null,
    targetUserId: event.targetUserId ?? null,
    targetType: event.targetType ?? null,
    targetId: event.targetId ?? null,
    transactionId: event.transactionId ?? null,
    requestId: event.requestId ?? context.requestId,
    ip: event.ip ?? context.ip,
    userAgent: event.userAgent ?? context.userAgent,
    metadata: event.metadata ? (redact(event.metadata) as Record<string, unknown>) : undefined,
  };
}

function emit(record: Normalised): void {
  const line = `${JSON.stringify({
    channel: "audit",
    at: new Date().toISOString(),
    mode: isDemo ? "demo" : "live",
    ...record,
    // The address is persisted for investigators; it does not belong in shared logs.
    ip: undefined,
    userAgent: record.userAgent ? String(redact(record.userAgent)) : null,
  })}\n`;
  process.stdout?.write?.(line);
}

const toDb = {
  outcome: { success: "SUCCESS", failure: "FAILURE", blocked: "BLOCKED" },
  severity: { info: "INFO", warning: "WARNING", critical: "CRITICAL" },
} as const;

async function persist(db: DbClient, record: Normalised): Promise<void> {
  await db.auditLog.create({
    data: {
      action: record.action,
      outcome: toDb.outcome[record.outcome],
      severity: toDb.severity[record.severity],
      actorId: record.actorId,
      actorRole: record.actorRole ? roleToDb(record.actorRole) : null,
      targetUserId: record.targetUserId,
      targetType: record.targetType,
      targetId: record.targetId,
      transactionId: record.transactionId,
      description: record.description.slice(0, 500),
      ip: record.ip,
      userAgent: record.userAgent,
      requestId: record.requestId,
      metadata: record.metadata as never,
    },
  });
}

/**
 * Records an event.
 *
 * Without `tx` this is best-effort and never throws — an audit failure must not
 * turn a login into a 500. With `tx` it throws on failure so the surrounding
 * transaction rolls back.
 */
export async function audit(event: AuditEvent): Promise<void> {
  const record = await normalise(event);
  emit(record);

  if (!isPersisted(record.action)) return;

  if (event.tx) {
    await persist(event.tx, record);
    return;
  }

  try {
    await persist(prisma, record);
  } catch (error) {
    process.stderr?.write?.(
      `${JSON.stringify({
        channel: "audit-error",
        action: record.action,
        error: error instanceof Error ? error.name : "unknown",
      })}\n`,
    );
  }
}

export function actorOf(user: { id: string; role: UserRole } | null): Pick<
  AuditEvent,
  "actorId" | "actorRole"
> {
  return { actorId: user?.id ?? null, actorRole: user?.role ?? null };
}

export const auditEnvironment = { mode: env.APP_MODE } as const;
