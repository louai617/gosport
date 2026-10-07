"use client";

import { useActionState, useState } from "react";
import { changePasswordAction } from "@/app/actions/auth";
import { emptyActionState } from "@/lib/actionState";
import { passwordStrength } from "@/lib/validation";
import { useT } from "@/i18n/I18nProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";

export function ChangePasswordForm() {
  const t = useT();
  const [state, formAction, pending] = useActionState(changePasswordAction, emptyActionState);
  const [next, setNext] = useState("");

  const fieldError = (name: string) =>
    state.fieldErrors?.[name] ? t(state.fieldErrors[name]) : undefined;

  return (
    <form action={formAction} className="mt-4 max-w-md space-y-4" noValidate>
      {state.messageKey && !state.fieldErrors ? (
        <Alert tone={state.ok ? "success" : "danger"}>{t(state.messageKey)}</Alert>
      ) : null}

      <PasswordInput
        name="currentPassword"
        autoComplete="current-password"
        required
        label={t("auth.field.currentPassword")}
        error={fieldError("currentPassword")}
      />
      <PasswordInput
        name="newPassword"
        autoComplete="new-password"
        required
        label={t("auth.field.newPassword")}
        hint={t("auth.field.passwordHint")}
        strength={passwordStrength(next)}
        value={next}
        onChange={(event) => setNext(event.target.value)}
        error={fieldError("newPassword")}
      />
      <PasswordInput
        name="confirmPassword"
        autoComplete="new-password"
        required
        label={t("auth.field.confirmPassword")}
        error={fieldError("confirmPassword")}
      />

      <Button type="submit" loading={pending}>
        {t("account.security.changePassword")}
      </Button>
    </form>
  );
}
