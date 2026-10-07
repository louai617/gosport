"use server";

import type { LimitFormState } from "@/lib/actionState";
import { limitChangeSchema } from "@/lib/validation";
import { guarded, readBoolean, text } from "@/server/actions";
import {
  requestCoolingOff,
  requestLimitChange,
  requestSelfExclusion,
} from "@/services/responsibleService";

/**
 * Responsible-gambling actions. Each is a real, persisted control: a limit is
 * enforced by the server on every wager (`assertWagerAllowed`), and an
 * exclusion cannot be ended early by the player or by anyone else.
 */

export async function updateLimitAction(
  _previous: LimitFormState,
  formData: FormData,
): Promise<LimitFormState> {
  const state = await guarded("responsible.limit", async () => {
    const parsed = limitChangeSchema.safeParse({
      kind: text(formData, "kind"),
      period: text(formData, "period"),
      value: Number(text(formData, "value").replace(",", ".")),
    });
    if (!parsed.success) {
      return { ok: false, messageKey: parsed.error.issues[0]?.message ?? "common.validation.invalid" };
    }
    const result = await requestLimitChange(parsed.data);
    return {
      ok: result.ok,
      messageKey: result.messageKey,
      data: { effect: result.effect },
    };
  });
  return {
    ok: state.ok,
    messageKey: state.messageKey,
    effect: state.data?.effect as LimitFormState["effect"],
    fieldError: state.ok ? undefined : state.messageKey,
  };
}

export async function coolingOffAction(
  _previous: LimitFormState,
  formData: FormData,
): Promise<LimitFormState> {
  const state = await guarded("responsible.coolingOff", async () => {
    const result = await requestCoolingOff(Number(text(formData, "days")));
    return { ok: result.ok, messageKey: result.messageKey ?? result.errorKey };
  });
  return { ok: state.ok, messageKey: state.messageKey };
}

export async function selfExclusionAction(
  _previous: LimitFormState,
  formData: FormData,
): Promise<LimitFormState> {
  const state = await guarded("responsible.selfExclusion", async () => {
    // The acknowledgement is the point of the form: this cannot be lifted early,
    // and a mis-tap must not be able to start it.
    if (!readBoolean(formData.get("acknowledged"))) {
      return { ok: false, messageKey: "responsible.validation.acknowledgeRequired" };
    }
    const raw = text(formData, "duration");
    const result = await requestSelfExclusion(raw === "permanent" ? "permanent" : Number(raw));
    return { ok: result.ok, messageKey: result.messageKey ?? result.errorKey };
  });
  return { ok: state.ok, messageKey: state.messageKey, fieldError: state.ok ? undefined : state.messageKey };
}
