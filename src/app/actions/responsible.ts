"use server";

import { limitChangeSchema, selfExclusionSchema } from "@/lib/validation";
import {
  requestCoolingOff,
  requestLimitChange,
  requestSelfExclusion,
} from "@/services/userService";
import type { LimitChangeResult } from "@/services/types";

/**
 * Responsible-gambling actions.
 *
 * ── DEMO ──────────────────────────────────────────────────────────────────
 * These change demo state only. In a real deployment every one of them is a
 * server-side control: `assertNotSelfExcluded` must run on every wagering and
 * deposit endpoint, and an exclusion must also be published to the national
 * register. A limit the UI merely displays is not a limit.
 * ──────────────────────────────────────────────────────────────────────────
 */

export interface LimitFormState {
  ok: boolean;
  messageKey?: string;
  effect?: "immediate" | "scheduled";
  fieldError?: string;
}

export const emptyLimitState: LimitFormState = { ok: false };

export async function updateLimitAction(
  _previous: LimitFormState,
  formData: FormData,
): Promise<LimitFormState> {
  const parsed = limitChangeSchema.safeParse({
    kind: formData.get("kind"),
    period: formData.get("period"),
    value: Number(formData.get("value")),
  });

  if (!parsed.success) {
    return { ok: false, fieldError: parsed.error.issues[0]?.message };
  }

  const result: LimitChangeResult = await requestLimitChange(parsed.data);
  return {
    ok: result.ok,
    messageKey: result.messageKey,
    effect: result.effect,
  };
}

export async function coolingOffAction(
  _previous: LimitFormState,
  formData: FormData,
): Promise<LimitFormState> {
  const days = Number(formData.get("days"));
  const result = await requestCoolingOff(days);
  return { ok: result.ok, messageKey: result.messageKey ?? result.errorKey };
}

export async function selfExclusionAction(
  _previous: LimitFormState,
  formData: FormData,
): Promise<LimitFormState> {
  const raw = formData.get("duration");
  const duration = raw === "permanent" ? "permanent" : Number(raw);

  const parsed = selfExclusionSchema.safeParse(
    duration === "permanent"
      ? { kind: "permanent", acknowledged: formData.get("acknowledged") === "on" }
      : {
          kind: "fixed",
          months: duration,
          acknowledged: formData.get("acknowledged") === "on",
        },
  );

  if (!parsed.success) {
    return { ok: false, fieldError: parsed.error.issues[0]?.message };
  }

  const result = await requestSelfExclusion(duration);
  return { ok: result.ok, messageKey: result.messageKey ?? result.errorKey };
}
