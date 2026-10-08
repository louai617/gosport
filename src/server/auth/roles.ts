import type { Role } from "@prisma/client";

import type { UserRole } from "@/types/user";

/**
 * The database enum ⇄ the lower-case role the application passes around.
 *
 * `ADMIN` was this platform's only staff role before it was split into
 * `MANAGER` and `SUPERADMIN`; a stray legacy value (an immutable audit row
 * written before the rename) reads as the superadmin it was.
 */
export function roleFromDb(role: Role | string): UserRole {
  switch (role) {
    case "SUPERADMIN":
    case "ADMIN":
      return "superadmin";
    case "MANAGER":
      return "manager";
    default:
      return "player";
  }
}

export function roleToDb(role: UserRole): Role {
  return role === "superadmin" ? "SUPERADMIN" : role === "manager" ? "MANAGER" : "PLAYER";
}

/** Where a role lands after signing in, and where it must change a generated password. */
export const HOME_BY_ROLE = {
  player: "/account",
  manager: "/admin",
  superadmin: "/admin",
} as const satisfies Record<UserRole, string>;

export const PASSWORD_CHANGE_BY_ROLE = {
  player: "/account/security",
  manager: "/admin/security",
  superadmin: "/admin/security",
} as const satisfies Record<UserRole, string>;

/** Staff roles use the operator console. */
export function isStaff(role: UserRole): boolean {
  return role === "manager" || role === "superadmin";
}
