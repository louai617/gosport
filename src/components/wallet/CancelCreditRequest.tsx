"use client";

import { useActionState } from "react";
import { cancelCreditRequestAction } from "@/app/actions/wallet";
import { emptyActionState } from "@/lib/actionState";
import { useT } from "@/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";

/** Withdraws a request that is still pending. The server cancels only the owner's pending one. */
export function CancelCreditRequest({ id }: { id: string }) {
  const t = useT();
  const [state, action, pending] = useActionState(cancelCreditRequestAction, emptyActionState);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="ghost" loading={pending}>
        {t("wallet.creditRequest.cancel")}
      </Button>
      {state.messageKey && !state.ok ? (
        <span role="alert" className="ms-2 text-caption normal-case tracking-normal text-danger">
          {t(state.messageKey)}
        </span>
      ) : null}
    </form>
  );
}
