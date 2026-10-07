import "server-only";

import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { can, type Permission } from "@/server/auth/permissions";
import { getSessionUser } from "@/server/auth/guard";
import type { SessionUser } from "@/types/user";

/**
 * Guards for server components and layouts: redirect rather than throw.
 *
 * These make the *experience* sensible (a signed-out visitor lands on the login
 * page, a player never sees an admin screen). They are not the authority: Next
 * renders a layout and its pages independently, so every service function
 * behind a page checks `requirePermission` itself.
 */

const PASSWORD_CHANGE_PATH = {
  player: "/account/security",
  admin: "/admin/security",
} as const;

async function currentPath(): Promise<string> {
  return (await headers()).get("x-pathname") ?? "/";
}

function loginUrl(next: string): string {
  return `/login?next=${encodeURIComponent(next)}`;
}

/** A signed-in account that still holds an initial password may only change it. */
async function enforcePasswordChange(user: SessionUser): Promise<void> {
  if (!user.mustChangePassword) return;
  const target = PASSWORD_CHANGE_PATH[user.role];
  if ((await currentPath()) !== target) redirect(`${target}?forced=1`);
}

export async function requirePageUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(loginUrl(await currentPath()));
  await enforcePasswordChange(user);
  return user;
}

/**
 * Admin screens. A signed-out visitor is sent to sign in; a signed-in player
 * gets a plain 404 — the console does not announce that it exists.
 */
export async function requirePageAdmin(permission: Permission = "admin.access"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(loginUrl(await currentPath()));
  if (!can(user.role, "admin.access") || !can(user.role, permission)) notFound();
  await enforcePasswordChange(user);
  return user;
}
