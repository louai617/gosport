/**
 * The state every server-action form carries. Isomorphic and tiny on purpose:
 * `"use server"` modules may only export async functions, so the type and the
 * initial value live here where both the action and the client form can import
 * them.
 */
export interface ActionState {
  ok: boolean;
  /** i18n key for a form-level message. */
  messageKey?: string;
  /** i18n keys per field name. */
  fieldErrors?: Record<string, string>;
  /** Anything the page needs after success: a one-time link, a reference. */
  data?: Record<string, string | number | boolean | null>;
}

export const emptyActionState: ActionState = { ok: false };

/** Responsible-gambling forms report an extra "when does it apply" signal. */
export interface LimitFormState {
  ok: boolean;
  messageKey?: string;
  effect?: "immediate" | "scheduled";
  fieldError?: string;
}

export const emptyLimitState: LimitFormState = { ok: false };
