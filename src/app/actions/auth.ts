"use server";

import { redirect } from "next/navigation";

import type { ActionState } from "@/lib/actionState";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validation";
import { env } from "@/server/env";
import { guarded, limitAction, readBoolean, text, zodFieldErrors } from "@/server/actions";
import { getSessionUser } from "@/server/auth/guard";
import { issueSession } from "@/server/auth/session";
import { safeRedirect } from "@/server/security/sanitize";
import { getRequestMeta } from "@/server/security/requestMeta";
import {
  changeOwnPassword,
  completePasswordReset,
  loginUser,
  logoutUser,
  registerPlayer,
  requestPasswordReset,
  revokeOtherSessions,
  revokeOwnSession,
} from "@/services/authService";

/**
 * Auth server actions. Thin by design: parse, rate-limit, call `authService`,
 * turn the result into form state. All the security-relevant logic — hashing,
 * lockout, enumeration resistance, session rotation — lives in the service.
 */

function landingFor(role: "player" | "admin", next: string | null): string {
  const fallback = role === "admin" ? "/admin" : "/account";
  const target = safeRedirect(next, env.APP_URL, fallback);
  // A player must not be bounced into the admin console, nor an admin into a
  // dead end — an out-of-role `next` falls back to the role's home.
  if (role === "player" && target.startsWith("/admin")) return fallback;
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
      redirect(result.user.role === "admin" ? "/admin/security?forced=1" : "/account/security?forced=1");
    }
    redirect(landingFor(result.user.role, text(formData, "next") || null));
  });
}

export async function registerAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("auth.register", async () => {
    const parsed = registerSchema.safeParse({
      username: text(formData, "username"),
      firstName: text(formData, "firstName"),
      lastName: text(formData, "lastName"),
      email: text(formData, "email"),
      phone: text(formData, "phone"),
      password: text(formData, "password"),
      confirmPassword: text(formData, "confirmPassword"),
      dateOfBirth: text(formData, "dateOfBirth"),
      country: text(formData, "country"),
      ageConfirmed: readBoolean(formData.get("ageConfirmed")),
      termsAccepted: readBoolean(formData.get("termsAccepted")),
      marketingOptIn: readBoolean(formData.get("marketingOptIn")),
    });
    if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

    const limited = await limitAction("register");
    if (limited) return limited;

    const result = await registerPlayer(parsed.data);
    if (!result.ok) {
      return { ok: false, messageKey: result.errorKey, fieldErrors: result.fieldErrors };
    }

    // Signed in straight away: the account exists, and there is no e-mail
    // transport to gate it on. It is still unverified — see `kycStatus`.
    const meta = await getRequestMeta();
    await issueSession(result.user, { ipHash: meta.ipHash, userAgent: meta.userAgent });
    redirect("/account");
  });
}

export async function forgotPasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("auth.forgot", async () => {
    const parsed = forgotPasswordSchema.safeParse({ email: text(formData, "email") });
    if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

    const limited = await limitAction("passwordReset", parsed.data.email);
    if (limited) return limited;

    await requestPasswordReset(parsed.data.email);
    // One answer for every address — a different reply per address would let
    // anyone enumerate accounts.
    return { ok: true, messageKey: "auth.forgot.submitted" };
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
    if (user?.mustChangePassword) redirect(user.role === "admin" ? "/admin" : "/account");
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
