"use client";

import { useState } from "react";
import { adjustWalletAction } from "@/app/actions/admin";
import { JURISDICTION } from "@/config/app.config";
import { newIdempotencyKey } from "@/components/wallet/WalletProvider";
import { useT } from "@/i18n/I18nProvider";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { ActionForm } from "./ActionForm";

export interface AdjustmentFormProps {
  playerId: string;
  username: string;
  allowedTypes: string[];
  maxAmount: number;
  approvalThreshold: number;
}

/**
 * Manual credit / debit. Every field the audit trail needs is required: the
 * amount, the type, a reason and an explicit confirmation that names the player
 * and the figure. The idempotency key is minted when the form mounts, so a
 * double-click posts once.
 */
export function AdjustmentForm({
  playerId,
  username,
  allowedTypes,
  maxAmount,
  approvalThreshold,
}: AdjustmentFormProps) {
  const t = useT();
  const [type, setType] = useState(allowedTypes[0] ?? "ADMIN_CREDIT");
  const [amount, setAmount] = useState("");
  const [key, setKey] = useState(() => newIdempotencyKey());

  const numeric = Number(amount.replace(",", "."));
  const needsApproval = approvalThreshold > 0 && numeric >= approvalThreshold;

  return (
    <ActionForm
      action={adjustWalletAction}
      submitLabel={needsApproval ? t("admin.wallet.requestApproval") : t("admin.wallet.apply")}
      onSuccess={(state) => {
        // A fresh key for the next adjustment once this one has gone through.
        if (state.ok) {
          queueMicrotask(() => {
            setKey(newIdempotencyKey());
            setAmount("");
          });
        }
        return state.data?.reference ? (
          <span className="numeric mt-1 block text-small">
            {t("admin.wallet.reference")}: {String(state.data.reference)}
          </span>
        ) : null;
      }}
    >
      {({ error }) => (
        <>
          <input type="hidden" name="playerId" value={playerId} />
          <input type="hidden" name="idempotencyKey" value={key} />

          <div className="grid gap-3 sm:grid-cols-2">
            <Select
              name="type"
              value={type}
              onChange={(event) => setType(event.target.value)}
              label={t("admin.wallet.type")}
              error={error("type")}
              options={allowedTypes.map((value) => ({ value, label: t(`admin.txType.${value}`) }))}
            />
            {type === "ADJUSTMENT" ? (
              <Select
                name="direction"
                defaultValue="credit"
                label={t("admin.wallet.direction")}
                error={error("direction")}
                options={[
                  { value: "credit", label: t("admin.wallet.credit") },
                  { value: "debit", label: t("admin.wallet.debit") },
                ]}
              />
            ) : null}
            <Input
              name="amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              label={t("wallet.amount")}
              suffix={JURISDICTION.currency}
              hint={t("admin.wallet.maxHint", { max: maxAmount })}
              error={error("amount")}
            />
            <Input
              name="reference"
              label={`${t("admin.wallet.externalReference")} (${t("ui.optional")})`}
              hint={t("admin.wallet.externalReferenceHint")}
              error={error("reference")}
            />
          </div>

          <Textarea
            name="reason"
            rows={3}
            label={t("admin.wallet.reason")}
            hint={t("admin.wallet.reasonHint")}
            error={error("reason")}
          />

          {needsApproval ? (
            <p className="rounded-md border border-warning/25 bg-warning-soft px-3 py-2 text-small text-warning">
              {t("admin.wallet.needsApproval", { threshold: approvalThreshold })}
            </p>
          ) : null}

          <Checkbox
            name="confirm"
            label={t("admin.wallet.confirm", { username, amount: amount || "0" })}
            error={error("confirm")}
          />
        </>
      )}
    </ActionForm>
  );
}
