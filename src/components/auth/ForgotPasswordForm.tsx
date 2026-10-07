"use client";


import { forgotPasswordAction } from "@/app/actions/auth";
import { useFormAction } from "@/lib/useFormAction";
import { useT } from "@/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormMessage } from "./FormMessage";

export function ForgotPasswordForm() {
  const t = useT();
  const { state, pending, formProps } = useFormAction(forgotPasswordAction);

  return (
    <form {...formProps} className="space-y-4" noValidate>
      <FormMessage state={state} />

      <Input
        name="email"
        type="email"
        autoComplete="email"
        required
        label={t("auth.field.email")}
        error={state.fieldErrors?.email ? t(state.fieldErrors.email) : undefined}
      />

      <Button type="submit" fullWidth size="lg" loading={pending}>
        {t("auth.forgot.submit")}
      </Button>
    </form>
  );
}
