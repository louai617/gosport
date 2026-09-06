"use server";

import { depositSchema, withdrawalSchema } from "@/lib/validation";
import { createDeposit, createWithdrawal } from "@/services/paymentService";

/**
 * Wallet actions.
 *
 * Both of these refuse. `paymentService` returns
 * `wallet.error.demoModeNoProvider` because no payment rail is integrated, and
 * simulating a successful deposit would be the single most misleading thing
 * this demonstration could do.
 */
export interface WalletFormState {
  ok: boolean;
  messageKey?: string;
  fieldErrors?: Record<string, string>;
}

export const emptyWalletState: WalletFormState = { ok: false };

function fieldErrorsFrom(issues: { path: PropertyKey[]; message: string }[]) {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function depositAction(
  _previous: WalletFormState,
  formData: FormData,
): Promise<WalletFormState> {
  const parsed = depositSchema.safeParse({
    methodId: formData.get("methodId"),
    amount: Number(formData.get("amount")),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const result = await createDeposit(parsed.data);
  return { ok: result.ok, messageKey: result.errorKey ?? "wallet.error.demoModeNoProvider" };
}

export async function withdrawAction(
  _previous: WalletFormState,
  formData: FormData,
): Promise<WalletFormState> {
  const parsed = withdrawalSchema.safeParse({
    methodId: formData.get("methodId"),
    amount: Number(formData.get("amount")),
  });

  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const result = await createWithdrawal(parsed.data);
  return { ok: result.ok, messageKey: result.errorKey ?? "wallet.error.demoModeNoProvider" };
}
