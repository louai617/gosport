import { z } from "zod";

import { JURISDICTION } from "@/config/app.config";
import { addZonedDays, startOfZonedDate } from "@/lib/zonedTime";

/**
 * Query-string schemas for the operator's lists.
 *
 * URLs are untrusted input like any other: every parameter is validated and
 * clamped, an empty field means "not set", and a value that does not parse is
 * dropped rather than reaching a query. The same schemas serve the pages
 * (`searchParams`) and the `/api/admin/*` routes.
 */

/** "" (an empty form field) is treated as absent. */
function optional<T extends z.ZodType>(schema: T) {
  return z.preprocess((value) => (value === "" || value === null ? undefined : value), schema.optional());
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Local calendar day → the instant it starts in the platform time zone. */
function dayStart(value: string): Date | undefined {
  if (!DAY.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  return startOfZonedDate(year!, month!, day!, JURISDICTION.timezone);
}

const fromDay = optional(z.string().regex(DAY)).transform((value) => (value ? dayStart(value) : undefined));

/** An inclusive end date becomes the last millisecond of that local day. */
const toDay = optional(z.string().regex(DAY)).transform((value) => {
  const start = value ? dayStart(value) : undefined;
  return start ? new Date(addZonedDays(new Date(start.getTime() + 43_200_000), 1, JURISDICTION.timezone).getTime() - 1) : undefined;
});

const page = optional(z.coerce.number().int().min(1).max(10_000));
const pageSize = optional(z.coerce.number().int().min(5).max(100));
const direction = optional(z.enum(["asc", "desc"]));
const search = optional(z.string().trim().max(64));
const money = optional(z.coerce.number().min(0).max(1_000_000_000));

export const PLAYER_STATUSES = [
  "pending",
  "active",
  "suspended",
  "locked",
  "self_excluded",
  "closed",
] as const;

export const KYC_STATUSES = ["not_started", "pending", "verified", "rejected", "expired"] as const;

export const TRANSACTION_KINDS = [
  "deposit",
  "withdrawal",
  "bet",
  "win",
  "refund",
  "bonus",
  "admin_credit",
  "admin_debit",
  "adjustment",
] as const;

export const TRANSACTION_STATUSES = ["pending", "completed", "failed", "cancelled", "reversed"] as const;

export const playerListQuery = z.object({
  search,
  status: optional(z.enum(PLAYER_STATUSES)),
  kycStatus: optional(z.enum(KYC_STATUSES)),
  restricted: optional(z.enum(["true"]).transform(() => true)),
  from: fromDay,
  to: toDay,
  page,
  pageSize,
  sort: optional(z.enum(["createdAt", "lastLoginAt", "username", "email", "balance", "status"])),
  direction,
});

export const transactionListQuery = z.object({
  search,
  kind: optional(z.enum(TRANSACTION_KINDS)),
  status: optional(z.enum(TRANSACTION_STATUSES)),
  userId: optional(z.string().trim().max(64)),
  from: fromDay,
  to: toDay,
  minAmount: money,
  maxAmount: money,
  page,
  pageSize,
  sort: optional(z.enum(["createdAt", "amount", "type", "status", "balanceAfter"])),
  direction,
});

export const betListQuery = z.object({
  search,
  kind: optional(z.enum(["sports", "casino"])),
  status: optional(z.enum(["pending", "won", "lost", "void", "cashed_out"])),
  userId: optional(z.string().trim().max(64)),
  from: fromDay,
  to: toDay,
  page,
  pageSize,
});

export const auditListQuery = z.object({
  actor: search,
  player: search,
  action: optional(z.string().trim().max(80)),
  transactionId: optional(z.string().trim().max(64)),
  ip: optional(z.string().trim().max(45)),
  severity: optional(z.enum(["info", "warning", "critical"])),
  outcome: optional(z.enum(["success", "failure", "blocked"])),
  from: fromDay,
  to: toDay,
  page,
  pageSize,
});

export type PlayerListParams = z.output<typeof playerListQuery>;
export type TransactionListParams = z.output<typeof transactionListQuery>;
export type BetListParams = z.output<typeof betListQuery>;
export type AuditListParams = z.output<typeof auditListQuery>;

/** Turns Next's `searchParams` (string | string[] | undefined) into plain strings. */
export function flattenParams(
  raw: Record<string, string | string[] | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(raw)) {
    out[key] = Array.isArray(value) ? value[0] : value;
  }
  return out;
}
