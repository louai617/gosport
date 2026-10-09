"use client";

import { requestCreditAction } from "@/app/actions/wallet";
import { JURISDICTION } from "@/config/app.config";
import { useT } from "@/i18n/I18nProvider";
import { Input } from "@/components/ui/Input";
import { ActionForm } from "@/components/admin/ActionForm";

/**
 * Ask the player's manager for credit. Sending a request moves nothing: the
 * manager decides, and an approval is a sale out of the manager's own balance.
 */
export function CreditRequestForm({ manager }: { manager: string }) {
  const t = useT();

  return (
    <ActionForm action={requestCreditAction} submitLabel={t("wallet.creditRequest.submit", { manager })}>
      {({ error }) => (
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            name="amount"
            inputMode="decimal"
            required
            label={`${t("wallet.creditRequest.amount")} (${JURISDICTION.currency})`}
            error={error("amount")}
          />
          <Input
            name="note"
            maxLength={200}
            label={`${t("wallet.creditRequest.note")} (${t("ui.optional")})`}
            hint={t("wallet.creditRequest.noteHint")}
            error={error("note")}
          />
        </div>
      )}
    </ActionForm>
  );
}
