"use server";

import { redirect } from "next/navigation";

import type { ActionState } from "@/lib/actionState";
import type { UserRole } from "@/types/user";
import {
  changePasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from "@/lib/validation";
import { env } from "@/server/env";
import { guarded, limitAction, readBoolean, text, zodFieldErrors } from "@/server/actions";
import { getSessionUser } from "@/server/auth/guard";
import { HOME_BY_ROLE, PASSWORD_CHANGE_BY_ROLE, isStaff } from "@/server/auth/roles";
import { safeRedirect } from "@/server/security/sanitize";
import {
  changeOwnPassword,
  completePasswordReset,
  loginUser,
  logoutUser,
  revokeOtherSessions,
  revokeOwnSession,
} from "@/services/authService";

/**
 * Auth server actions. Thin by design: parse, rate-limit, call `authService`,
 * turn the result into form state. All the security-relevant logic — hashing,
 * lockout, enumeration resistance, session rotation — lives in the service.
 */

function landingFor(role: UserRole, next: string | null): string {
  const fallback = HOME_BY_ROLE[role];
  const target = safeRedirect(next, env.APP_URL, fallback);
  // A player must not be bounced into the operator console, nor staff into a
  // dead end — an out-of-role `next` falls back to the role's home.
  if (!isStaff(role) && target.startsWith("/admin")) return fallback;
  return target;
}

export async function loginAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  return guarded("auth.login", async () => {
    const parsed = loginSchema.safeParse({
      identifier: text(formData, "identifier"),
      password: text(formData, "password"),
      rememberMe: readBoolean(formData.get("rememberMe")),
    });
    if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

    const limited = await limitAction("login", parsed.data.identifier);
    if (limited) return limited;

    const result = await loginUser(parsed.data);
    if (!result.ok) return { ok: false, messageKey: result.errorKey };

    if (result.user.mustChangePassword) {
      redirect(`${PASSWORD_CHANGE_BY_ROLE[result.user.role]}?forced=1`);
    }
    redirect(landingFor(result.user.role, text(formData, "next") || null));
  });
}

export async function resetPasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("auth.reset", async () => {
    const parsed = resetPasswordSchema.safeParse({
      token: text(formData, "token"),
      password: text(formData, "password"),
      confirmPassword: text(formData, "confirmPassword"),
    });
    if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

    const limited = await limitAction("passwordReset");
    if (limited) return limited;

    const result = await completePasswordReset(parsed.data.token, parsed.data.password);
    if (!result.ok) {
      return { ok: false, messageKey: result.errorKey, fieldErrors: result.fieldErrors };
    }
    redirect("/login?reset=1");
  });
}

export async function changePasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("auth.changePassword", async () => {
    const parsed = changePasswordSchema.safeParse({
      currentPassword: text(formData, "currentPassword"),
      newPassword: text(formData, "newPassword"),
      confirmPassword: text(formData, "confirmPassword"),
    });
    if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

    const user = await getSessionUser();
    const limited = await limitAction("password", user?.id);
    if (limited) return limited;

    const result = await changeOwnPassword({
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
    });
    if (!result.ok) {
      return { ok: false, messageKey: result.errorKey, fieldErrors: result.fieldErrors };
    }
    // A forced change is the only thing standing between the account and the
    // rest of the app; once done, go there.
    if (user?.mustChangePassword) redirect(HOME_BY_ROLE[user.role]);
    return { ok: true, messageKey: "account.security.passwordChanged" };
  });
}

export async function logoutAction(): Promise<void> {
  await logoutUser();
  redirect("/");
}

export async function revokeSessionAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("auth.revokeSession", async () => {
    const done = await revokeOwnSession(text(formData, "sessionId"));
    return done
      ? { ok: true, messageKey: "account.security.sessionRevoked" }
      : { ok: false, messageKey: "common.error.unexpected" };
  });
}

export async function revokeOtherSessionsAction(): Promise<ActionState> {
  return guarded("auth.revokeOthers", async () => {
    await revokeOtherSessions();
    return { ok: true, messageKey: "account.security.otherSessionsRevoked" };
  });
}
