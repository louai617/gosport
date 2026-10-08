"use client";

import { useState } from "react";
import { issueCreditAction, sellCreditAction } from "@/app/actions/admin";
import { useT } from "@/i18n/I18nProvider";
import { newIdempotencyKey } from "@/components/wallet/WalletProvider";
import { Input } from "@/components/ui/Input";
import { ActionForm } from "./ActionForm";

export interface CreditFormProps {
  /** `issue`: superadmin → manager. `sell`: manager → one of their players. */
  mode: "issue" | "sell";
  accountId: string;
  username: string;
  /** Shown beside the amount: the manager's own spendable balance (formatted). */
  balanceLabel?: string;
}

/**
 * One amount, one button. The idempotency key is minted when the form mounts
 * and renewed after a success, so a double-click moves credit once.
 */
export function CreditForm({ mode, accountId, username, balanceLabel }: CreditFormProps) {
  const t = useT();
  const [key, setKey] = useState(() => newIdempotencyKey());

  return (
    <ActionForm
      action={mode === "issue" ? issueCreditAction : sellCreditAction}
      submitLabel={t(mode === "issue" ? "admin.credit.issueSubmit" : "admin.credit.sellSubmit", { username })}
      onSuccess={(state) => {
        if (state.ok) queueMicrotask(() => setKey(newIdempotencyKey()));
        return state.data?.reference ? (
          <span className="numeric mt-1 block text-small">
            {t("admin.wallet.reference")}: {String(state.data.reference)}
          </span>
        ) : null;
      }}
    >
      {({ error }) => (
        <>
          <input type="hidden" name="accountId" value={accountId} />
          <input type="hidden" name="idempotencyKey" value={key} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              name="amount"
              inputMode="decimal"
              required
              label={t("admin.credit.amount")}
              hint={balanceLabel ? t("admin.credit.available", { balance: balanceLabel }) : undefined}
              error={error("amount")}
            />
            <Input name="note" label={`${t("admin.credit.note")} (${t("ui.optional")})`} error={error("note")} />
          </div>
        </>
      )}
    </ActionForm>
  );
}
