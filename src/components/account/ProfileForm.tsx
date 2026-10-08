"use client";


import { updateProfileAction } from "@/app/actions/account";
import { useFormAction } from "@/lib/useFormAction";
import { useT } from "@/i18n/I18nProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

export interface ProfileFormProps {
  displayName: string;
}

/** The one field a player may change themselves; everything else is an operator decision. */
export function ProfileForm({ displayName }: ProfileFormProps) {
  const t = useT();
  const { state, pending, formProps } = useFormAction(updateProfileAction);

  const fieldError = (name: string) =>
    state.fieldErrors?.[name] ? t(state.fieldErrors[name]) : undefined;

  return (
    <form {...formProps} className="space-y-4 rounded-xl border border-line bg-surface p-4" noValidate>
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
      </div>

      <Button type="submit" loading={pending}>
        {t("account.profile.save")}
      </Button>
    </form>
  );
}
