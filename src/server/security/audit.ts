import { env, isDemo, piiHashSalt } from "@/server/env";
import { sha256Hex } from "@/server/security/sanitize";
import type { UserRole } from "@/types/user";

/**
 * Audit trail.
 *
 * A regulator does not ask whether the product worked; it asks who did what,
 * when, from where, and whether the record could have been altered afterwards.
 * Everything that touches money, odds, a limit or an account state must land
 * here — and the record must be useful without being a second copy of the
 * player database, hence `redact()`.
 */

export type AuditAction =
  /* authentication */
  | "auth.register"
  | "auth.login"
  | "auth.login_failed"
  | "auth.logout"
  | "auth.password_reset_requested"
  | "auth.password_reset_completed"
  | "auth.password_changed"
  | "auth.session_rotated"
  | "auth.session_revoked"
  /* wagering */
  | "bet.placed"
  | "bet.rejected"
  | "bet.settled"
  | "bet.voided"
  | "bet.cashed_out"
  /* wallet */
  | "wallet.deposit_initiated"
  | "wallet.deposit_completed"
  | "wallet.deposit_failed"
  | "wallet.withdrawal_requested"
  | "wallet.withdrawal_approved"
  | "wallet.withdrawal_rejected"
  | "wallet.adjustment"
  /* responsible gambling */
  | "limit.created"
  | "limit.decreased"
  | "limit.increase_scheduled"
  | "limit.increase_applied"
  | "limit.breached"
  | "exclusion.cooling_off_started"
  | "exclusion.self_exclusion_started"
  | "exclusion.blocked_action"
  | "exclusion.expired"
  /* operator */
  | "admin.user_viewed"
  | "admin.user_status_changed"
  | "admin.role_changed"
  | "admin.odds_overridden"
  | "admin.bet_settled_manually"
  | "admin.export_generated"
  /* platform */
  | "security.rate_limited"
  | "security.csrf_rejected"
  | "security.unauthorized"
  | "security.forbidden"
  | "system.error";

export type AuditOutcome = "success" | "failure" | "blocked";

export interface AuditEvent {
  action: AuditAction;
  outcome: AuditOutcome;
  /** Who performed it. Absent for anonymous and system events. */
  actorId?: string | null;
  actorRole?: UserRole | null;
  /** What it was performed on — a user, a bet, a transaction. */
  subjectId?: string | null;
  subjectType?: string | null;
  requestId?: string | null;
  /** Already hashed by `hashIp` before it reaches here. */
  ipHash?: string | null;
  userAgent?: string | null;
  /** Free-form context. Passed through `redact()` without exception. */
  metadata?: Record<string, unknown>;
}

/** What actually lands in the sink. */
export interface AuditRecord extends Omit<AuditEvent, "metadata"> {
  at: string;
  mode: "demo" | "live";
  metadata?: Record<string, unknown>;
}

/* ------------------------------------------------------------- redaction */

/** Field names whose value is never useful and always dangerous in a log. */
const SECRET_KEY_PATTERN =
  /(pass(word)?|secret|token|api[_-]?key|authorization|cookie|session|csrf|otp|pin|cvv|cvc|pan|iban|card|signature|private)/i;

const EMAIL_KEY_PATTERN = /email/i;
const PHONE_KEY_PATTERN = /phone|msisdn|mobile/i;

const REDACTED = "[redacted]";
const MAX_DEPTH = 6;
const MAX_ARRAY_ITEMS = 50;
const MAX_STRING_LENGTH = 512;

/**
 * Deterministic pseudonym for an email address.
 *
 * An investigator needs to correlate events for one account without the log
 * itself becoming a mailing list; a salted digest gives correlation and nothing
 * else. Support looks the account up by id, which is already in the record.
 */
export function hashEmail(email: string): string {
  return `email:${sha256Hex(`email:${piiHashSalt}:${email.trim().toLowerCase()}`).slice(0, 24)}`;
}

/**
 * Keeps the country and operator prefix, drops the subscriber digits. Enough to
 * spot a fraud ring sharing one number range, useless for contacting anyone.
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 6) return REDACTED;
  const prefix = phone.trim().startsWith("+") ? "+" : "";
  return `${prefix}${digits.slice(0, digits.length - 6)}${"*".repeat(4)}${digits.slice(-2)}`;
}

const EMAIL_IN_TEXT = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

/**
 * Recursively strips or pseudonymises anything a log must not hold.
 *
 * Pure: same input, same output, no clock and no I/O — so the rules below can
 * be unit-tested directly, which matters because this is the one function
 * standing between a stack trace and a data-protection incident.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > MAX_DEPTH) return "[truncated]";

  if (typeof value === "string") {
    // A value can carry an address even when its key does not say so — an
    // error message, a query echo, a provider payload.
    const withoutEmails = value.replace(EMAIL_IN_TEXT, (match) => hashEmail(match));
    return withoutEmails.length > MAX_STRING_LENGTH
      ? `${withoutEmails.slice(0, MAX_STRING_LENGTH)}…`
      : withoutEmails;
  }

  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();

  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY_ITEMS).map((item) => redact(item, depth + 1));
    if (value.length > MAX_ARRAY_ITEMS) items.push(`[+${value.length - MAX_ARRAY_ITEMS} more]`);
    return items;
  }

  if (value instanceof Error) {
    return { name: value.name, message: redact(value.message, depth + 1) };
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        output[key] = REDACTED;
        continue;
      }
      if (typeof entry === "string" && EMAIL_KEY_PATTERN.test(key)) {
        output[key] = hashEmail(entry);
        continue;
      }
      if (typeof entry === "string" && PHONE_KEY_PATTERN.test(key)) {
        output[key] = maskPhone(entry);
        continue;
      }
      output[key] = redact(entry, depth + 1);
    }
    return output;
  }

  // Functions, symbols — nothing a log should carry.
  return REDACTED;
}

/* ------------------------------------------------------------------ sink */

export interface AuditSink {
  write(record: AuditRecord): Promise<void>;
}

/**
 * Structured single-line JSON on stdout, which is what a container platform
 * ships to a log pipeline. `console` is avoided so this never trips the
 * no-console rule and never gets swallowed by a client-side logger.
 */
function createStdoutSink(): AuditSink {
  return {
    async write(record) {
      const line = `${JSON.stringify({ channel: "audit", ...record })}\n`;
      // Absent in the Edge runtime; an audited action never runs there, but
      // dropping the line is better than throwing inside an error path.
      process.stdout?.write?.(line);
    },
  };
}

let sink: AuditSink = createStdoutSink();

/** Swap the sink — a database writer in production, a spy in tests. */
export function setAuditSink(next: AuditSink): void {
  sink = next;
}

/**
 * Records one auditable action.
 *
 * DEMO: the sink is stdout, which is neither durable nor tamper-evident.
 *
 * PRODUCTION requires all four of:
 *  1. an append-only store the application role can INSERT into and cannot
 *     UPDATE or DELETE;
 *  2. tamper evidence — each row carries a hash chained to its predecessor, so
 *     a deletion or edit breaks the chain and is detectable;
 *  3. retention for the period the licence demands (commonly five years for
 *     wagering and payment events), with deletion blocked before then;
 *  4. shipping off-host in near real time, so compromising the application
 *     server does not also compromise the evidence of the compromise.
 *
 * Never throws. An audit failure must not turn a successful withdrawal into an
 * error for the player — but it must be alerted on, because an operator that
 * cannot write its audit trail is, in regulatory terms, not operating.
 */
export async function audit(event: AuditEvent): Promise<void> {
  const record: AuditRecord = {
    ...event,
    at: new Date().toISOString(),
    mode: isDemo ? "demo" : "live",
    userAgent: event.userAgent ? String(redact(event.userAgent)) : null,
    metadata: event.metadata
      ? (redact(event.metadata) as Record<string, unknown>)
      : undefined,
  };

  try {
    await sink.write(record);
  } catch {
    // Deliberately silent: see the contract above. Production wires this to the
    // alerting channel rather than swallowing it.
  }
}

/** Convenience for the common "who did it" triple, kept out of every call site. */
export function actorOf(user: {
  id: string;
  role: UserRole;
} | null): Pick<AuditEvent, "actorId" | "actorRole"> {
  return { actorId: user?.id ?? null, actorRole: user?.role ?? null };
}

/** Exposed for the admin log viewer so it can label the environment honestly. */
export const auditEnvironment = { mode: env.APP_MODE } as const;
