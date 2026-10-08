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
  "managers.read",
  "managers.create",
  "managers.update",
  "credit.issue",
  "credit.distribute",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * A manager runs a book of players: creates their accounts, resets their
 * passwords, suspends them and sells them credit out of the manager's own
 * balance. Every one of these is further **scoped to the players that manager
 * created** inside the service (`server/auth/scope.ts`) — the permission says
 * the role may do the thing, the scope says to whom.
 *
 * `credit.distribute` is a manager's alone; `credit.issue` (minting credit onto
 * a manager) is the superadmin's alone.
 */
const MANAGER_PERMISSIONS: readonly Permission[] = [
  "admin.access",
  "players.read",
  "players.create",
  "players.suspend",
  "players.credentials",
  "transactions.read",
  "notifications.read",
  "credit.distribute",
];

export const ROLE_PERMISSIONS: Readonly<Record<UserRole, ReadonlySet<Permission>>> = {
  player: new Set<Permission>(),
  manager: new Set<Permission>(MANAGER_PERMISSIONS),
  // Everything except the manager-only act of selling credit out of a balance.
  superadmin: new Set<Permission>(PERMISSIONS.filter((p) => p !== "credit.distribute")),
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}
