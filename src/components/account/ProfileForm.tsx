"use client";

import { useActionState } from "react";
import { updateProfileAction } from "@/app/actions/account";
import { emptyActionState } from "@/lib/actionState";
import { useT } from "@/i18n/I18nProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export interface ProfileFormProps {
  displayName: string;
  phone: string;
}

/** The two fields a player may change themselves; everything else is an operator decision. */
export function ProfileForm({ displayName, phone }: ProfileFormProps) {
  const t = useT();
  const [state, formAction, pending] = useActionState(updateProfileAction, emptyActionState);

  const fieldError = (name: string) =>
    state.fieldErrors?.[name] ? t(state.fieldErrors[name]) : undefined;

  return (
    <form action={formAction} className="space-y-4 rounded-xl border border-line bg-surface p-4" noValidate>
      {state.messageKey && !state.fieldErrors ? (
        <Alert tone={state.ok ? "success" : "danger"}>{t(state.messageKey)}</Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          name="displayName"
          defaultValue={displayName}
          required
          label={t("account.profile.displayName")}
          error={fieldError("displayName")}
        />
        <Input
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={phone}
          required
          label={t("auth.field.phone")}
          error={fieldError("phone")}
        />
      </div>

      <Button type="submit" loading={pending}>
        {t("account.profile.save")}
      </Button>
    </form>
  );
}
