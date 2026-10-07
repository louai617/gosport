"use client";

import { useActionState, useState } from "react";
import type { PaymentMethod } from "@/types";
import { withdrawAction } from "@/app/actions/wallet";
import { emptyActionState } from "@/lib/actionState";
import { JURISDICTION } from "@/config/app.config";
import { useT } from "@/i18n/I18nProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { PaymentMethodCard } from "./PaymentMethodCard";

/**
 * Withdrawal request.
 *
 * Submitting holds the funds at once and queues the request for an operator —
 * the page says so before and after. The idempotency key is minted when the form
 * mounts, so a double-click or a retried submit books one withdrawal, not two.
 */
export function WithdrawForm({ methods }: { methods: PaymentMethod[] }) {
  const t = useT();
  const [state, formAction, pending] = useActionState(withdrawAction, emptyActionState);
  const [methodId, setMethodId] = useState<string>(methods[0]?.id ?? "");
  // Fresh per mount, and re-minted after a success so the next request is new.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [handled, setHandled] = useState(state);

  if (state !== handled) {
    setHandled(state);
    if (state.ok) setIdempotencyKey(crypto.randomUUID());
  }

  const fieldError = (name: string) =>
    state.fieldErrors?.[name] ? t(state.fieldErrors[name]) : undefined;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <Alert tone="info">{t("wallet.withdraw.operatorNote")}</Alert>

      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      <fieldset>
        <legend className="mb-2 text-small font-semibold text-ink">{t("wallet.method")}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {methods.map((method) => (
            <PaymentMethodCard
              key={method.id}
              method={method}
              selected={methodId === method.id}
              onSelect={setMethodId}
            />
          ))}
        </div>
        {fieldError("methodId") ? (
          <p role="alert" className="mt-2 text-small text-danger">
            {fieldError("methodId")}
          </p>
        ) : null}
      </fieldset>

      <Input
        name="amount"
        inputMode="decimal"
        label={t("wallet.amount")}
        suffix={JURISDICTION.currency}
        placeholder="0.00"
        error={fieldError("amount")}
      />

      <Checkbox
        name="confirmOwnership"
        required
        label={t("wallet.withdraw.confirmOwnership")}
        error={fieldError("confirmOwnership")}
      />

      {state.messageKey ? (
        <Alert tone={state.ok ? "success" : "danger"}>
          {t(state.messageKey)}
          {state.ok && state.data?.reference ? (
            <span className="numeric mt-1 block text-small">
              {t("wallet.withdraw.reference")}: {String(state.data.reference)}
            </span>
          ) : null}
        </Alert>
      ) : null}

      <Button type="submit" size="lg" loading={pending} disabled={!methodId}>
        {t("wallet.submitWithdrawal")}
      </Button>
    </form>
  );
}
