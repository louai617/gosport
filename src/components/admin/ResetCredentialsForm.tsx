"use client";

import { resetCredentialsAction } from "@/app/actions/admin";
import { useT } from "@/i18n/I18nProvider";
import { Checkbox } from "@/components/ui/Checkbox";
import { ActionForm } from "./ActionForm";
import { CredentialsReveal } from "./CredentialsReveal";

/**
 * Replaces an account's password with a generated one. The old password stops
 * working immediately, every session of the account ends, and the holder must
 * choose their own password at the next sign-in. The new one is shown once.
 */
export function ResetCredentialsForm({
  accountId,
  username,
  kind,
}: {
  accountId: string;
  username: string;
  kind: "player" | "manager";
}) {
  const t = useT();

  return (
    <ActionForm
      action={resetCredentialsAction}
      submitLabel={t("admin.credentials.reset")}
      variant="secondary"
      onSuccess={(state) =>
        state.data?.password ? (
          <span className="mt-3 block">
            <CredentialsReveal username={String(state.data.username)} password={String(state.data.password)} />
          </span>
        ) : null
      }
    >
      {({ error }) => (
        <>
          <input type="hidden" name="accountId" value={accountId} />
          <input type="hidden" name="kind" value={kind} />
          <p className="text-small text-ink-muted">{t("admin.credentials.resetHint")}</p>
          <Checkbox
            name="confirm"
            label={t("admin.credentials.confirmReset", { username })}
            error={error("confirm")}
          />
        </>
      )}
    </ActionForm>
  );
}
