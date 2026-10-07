"use server";

import type { ActionState } from "@/lib/actionState";
import { depositSchema, withdrawalSchema } from "@/lib/validation";
import { guarded, limitAction, readBoolean, text, zodFieldErrors } from "@/server/actions";
import { getSessionUser } from "@/server/auth/guard";
import { createDeposit, createWithdrawal } from "@/services/paymentService";

/**
 * Player wallet actions.
 *
 * A deposit is refused — no payment provider is connected, and recording a
 * deposit that moved no real money would be the most misleading thing this
 * platform could do; credit is added by an operator. A withdrawal *request* is
 * real: it holds the funds and joins the operator's queue.
 */

export async function depositAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("wallet.deposit", async () => {
    const parsed = depositSchema.safeParse({
      methodId: text(formData, "methodId"),
      amount: text(formData, "amount"),
    });
    if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

    const limited = await limitAction("deposit", (await getSessionUser())?.id);
    if (limited) return limited;

    const result = await createDeposit(parsed.data);
    return { ok: result.ok, messageKey: result.errorKey ?? "wallet.error.demoModeNoProvider" };
  });
}

export async function withdrawAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return guarded("wallet.withdraw", async () => {
    const parsed = withdrawalSchema.safeParse({
      methodId: text(formData, "methodId"),
      amount: text(formData, "amount"),
      confirmOwnership: readBoolean(formData.get("confirmOwnership")),
      idempotencyKey: text(formData, "idempotencyKey") || undefined,
    });
    if (!parsed.success) return { ok: false, fieldErrors: zodFieldErrors(parsed.error) };

    const limited = await limitAction("deposit", (await getSessionUser())?.id);
    if (limited) return limited;

    const result = await createWithdrawal(parsed.data);
    return result.ok
      ? { ok: true, messageKey: "wallet.withdrawRequested", data: { reference: result.intentId } }
      : { ok: false, messageKey: result.errorKey ?? "common.error.unexpected" };
  });
}
