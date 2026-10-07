import type { UserRole } from "@/types/user";

/**
 * Role-based access control.
 *
 * Authorisation is decided by `can(role, permission)` — a lookup in this table —
 * and never by comparing a role name at a call site. That is what makes adding
 * a staff role a one-place change: add a member to `Role` in the Prisma schema,
 * add a row below, and every `requirePermission(...)` already enforces it.
 *
 * Every protected service function and route checks a *permission*, server-side,
 * against the role read from the database on that request. Nothing here is ever
 * derived from client input.
 */
export const PERMISSIONS = [
  "admin.access",
  "dashboard.read",
  "players.read",
  "players.create",
  "players.update",
  "players.suspend",
  "players.lock",
  "players.sessions.revoke",
  "players.credentials",
  "wallet.read",
  "wallet.adjust",
  "wallet.adjust.approve",
  "withdrawals.process",
  "transactions.read",
  "bets.read",
  "bets.settle",
  "reports.read",
  "reports.export",
  "audit.read",
  "notifications.read",
  "settings.read",
  "settings.update",
  "search.use",
  "rg.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_PERMISSIONS: Readonly<Record<UserRole, ReadonlySet<Permission>>> = {
  player: new Set<Permission>(),
  admin: new Set<Permission>(PERMISSIONS),
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}
