"use client";

import { useActionState } from "react";
import { decideAdjustmentAction, decideCreditRequestAction, processWithdrawalAction } from "@/app/actions/admin";
import { emptyActionState } from "@/lib/actionState";
import { useT } from "@/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";

/**
 * Approve / reject controls for a queue row. Each is its own POST; the server
 * claims the row with a conditional update, so two clicks (or two operators)
 * process it once.
 */
export function DecisionButtons({ id, kind }: { id: string; kind: "withdrawal" | "adjustment" | "credit" }) {
  const t = useT();
  const action =
    kind === "withdrawal" ? processWithdrawalAction : kind === "credit" ? decideCreditRequestAction : decideAdjustmentAction;
  const [state, formAction, pending] = useActionState(action, emptyActionState);

  if (state.ok) {
    return <span className="text-small text-success">{t(state.messageKey ?? "ui.done")}</span>;
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center justify-end gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        name="note"
        maxLength={300}
        placeholder={t("admin.wallet.notePlaceholder")}
        aria-label={t("admin.wallet.note")}
        className="h-8 w-40 rounded-md border border-line bg-surface-2 px-2 text-small text-ink focus:border-primary"
      />
      <Button type="submit" name="decision" value="approve" size="sm" loading={pending}>
        {t("admin.wallet.approve")}
      </Button>
      <Button type="submit" name="decision" value="reject" size="sm" variant="danger" disabled={pending}>
        {t("admin.wallet.reject")}
      </Button>
      {state.messageKey && !state.ok ? (
        <span role="alert" className="basis-full text-end text-caption normal-case tracking-normal text-danger">
          {t(state.messageKey)}
        </span>
      ) : null}
    </form>
  );
}
