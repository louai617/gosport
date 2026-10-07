"use client";

import { useActionState, useState } from "react";
import { resetPasswordAction } from "@/app/actions/auth";
import { emptyActionState } from "@/lib/actionState";
import { passwordStrength } from "@/lib/validation";
import { useT } from "@/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { FormMessage } from "./FormMessage";

/** Sets a new password from a one-time link (password reset or invitation). */
export function ResetPasswordForm({ token }: { token: string }) {
  const t = useT();
  const [state, formAction, pending] = useActionState(resetPasswordAction, emptyActionState);
  const [password, setPassword] = useState("");

  const fieldError = (name: string) =>
    state.fieldErrors?.[name] ? t(state.fieldErrors[name]) : undefined;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />

      <PasswordInput
        name="password"
        autoComplete="new-password"
        required
        label={t("auth.field.newPassword")}
        hint={t("auth.field.passwordHint")}
        strength={passwordStrength(password)}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldError("password") ?? fieldError("token")}
      />
      <PasswordInput
        name="confirmPassword"
        autoComplete="new-password"
        required
        label={t("auth.field.confirmPassword")}
        error={fieldError("confirmPassword")}
      />

      <Button type="submit" fullWidth size="lg" loading={pending}>
        {t("auth.reset.submit")}
      </Button>
    </form>
  );
}
