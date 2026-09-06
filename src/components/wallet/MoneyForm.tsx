"use client";

import { useActionState, useState } from "react";
import type { PaymentMethod } from "@/types";
import {
  depositAction,
  emptyWalletState,
  withdrawAction,
} from "@/app/actions/wallet";
import { JURISDICTION } from "@/config/app.config";
import { useT } from "@/i18n/I18nProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PaymentMethodCard } from "./PaymentMethodCard";

export interface MoneyFormProps {
  kind: "deposit" | "withdrawal";
  methods: PaymentMethod[];
}

/**
 * Deposit and withdrawal share one form: the fields, validation and provider
 * boundary are identical, and only the action and the button label differ.
 *
 * It always fails, on purpose. `paymentService` refuses in demo mode rather
 * than reporting a success that did not happen.
 */
export function MoneyForm({ kind, methods }: MoneyFormProps) {
  const t = useT();
  const [state, formAction, pending] = useActionState(
    kind === "deposit" ? depositAction : withdrawAction,
    emptyWalletState,
  );
  const [methodId, setMethodId] = useState<string>("");

  return (
    <form action={formAction} className="space-y-5">
      <Alert tone="warning" title={t("common.demo.badge")}>
        {t("wallet.error.demoModeNoProvider")}
      </Alert>

      <fieldset>
        <legend className="mb-2 text-small font-semibold text-ink">
          {t("wallet.method")}
        </legend>
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
        {state.fieldErrors?.methodId ? (
          <p role="alert" className="mt-2 text-small text-danger">
            {t(state.fieldErrors.methodId)}
          </p>
        ) : null}
      </fieldset>

      <Input
        name="amount"
        inputMode="decimal"
        label={t("wallet.amount")}
        suffix={JURISDICTION.currency}
        placeholder="0.00"
        error={state.fieldErrors?.amount ? t(state.fieldErrors.amount) : undefined}
      />

      {state.messageKey ? (
        <Alert tone={state.ok ? "success" : "danger"}>{t(state.messageKey)}</Alert>
      ) : null}

      <Button type="submit" size="lg" loading={pending}>
        {kind === "deposit" ? t("wallet.submitDeposit") : t("wallet.submitWithdrawal")}
      </Button>

      <p className="text-caption normal-case leading-relaxed tracking-normal text-ink-subtle">
        {t("wallet.providerNotice")}
      </p>
    </form>
  );
}
