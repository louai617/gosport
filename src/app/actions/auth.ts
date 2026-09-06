"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
} from "@/lib/validation";
import {
  DEMO_SESSION_COOKIE,
  login,
  logout,
  register,
  requestPasswordReset,
} from "@/services/userService";

/**
 * Auth server actions.
 *
 * ── DEMO ──────────────────────────────────────────────────────────────────
 * No credential is stored, checked or hashed here, and no account is created.
 * "Signing in" sets a marker cookie so the account screens have something to
 * render. Registration performs **no age or identity verification** — the age
 * checkbox is a self-declaration, and a licensed provider must gate the
 * account before any real play. See docs/COMPLIANCE.md.
 * ──────────────────────────────────────────────────────────────────────────
 */

export interface FormState {
  ok: boolean;
  /** i18n key for a form-level message. */
  messageKey?: string;
  /** i18n keys per field name. */
  fieldErrors?: Record<string, string>;
}

export const emptyFormState: FormState = { ok: false };

const SESSION_MAX_AGE = 60 * 60 * 8;

/** Zod messages in this codebase are i18n keys, so they pass straight through. */
function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !fields[field]) fields[field] = issue.message;
  }
  return fields;
}

function readBoolean(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true";
}

export async function loginAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    rememberMe: readBoolean(formData.get("rememberMe")),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  const result = await login(parsed.data);
  if (!result.ok) return { ok: false, messageKey: result.errorKey };

  const store = await cookies();
  store.set(DEMO_SESSION_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: parsed.data.rememberMe ? SESSION_MAX_AGE * 7 : SESSION_MAX_AGE,
  });

  redirect("/account");
}

export async function registerAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    dateOfBirth: formData.get("dateOfBirth"),
    country: formData.get("country"),
    ageConfirmed: readBoolean(formData.get("ageConfirmed")),
    termsAccepted: readBoolean(formData.get("termsAccepted")),
    marketingOptIn: readBoolean(formData.get("marketingOptIn")),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  const result = await register(parsed.data);
  if (!result.ok) return { ok: false, messageKey: result.errorKey };

  // Deliberately does NOT sign the visitor in. A real flow gates a new account
  // behind email confirmation and identity verification before it can do
  // anything; dropping straight into a signed-in state would misrepresent that.
  return { ok: true, messageKey: "auth.register.submitted" };
}

export async function forgotPasswordAction(
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse({ email: formData.get("email") });

  if (!parsed.success) {
    return { ok: false, fieldErrors: toFieldErrors(parsed.error) };
  }

  await requestPasswordReset(parsed.data.email);

  // The same answer regardless of whether the address exists — a different
  // response per address turns this into an account-enumeration oracle.
  return { ok: true, messageKey: "auth.forgot.submitted" };
}

export async function logoutAction(): Promise<void> {
  await logout();
  const store = await cookies();
  store.delete(DEMO_SESSION_COOKIE);
  redirect("/");
}
