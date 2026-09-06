"use client";

import { useActionState } from "react";
import Link from "next/link";
import { emptyFormState, loginAction } from "@/app/actions/auth";
import { useT } from "@/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { FormMessage } from "./FormMessage";

export function LoginForm() {
  const t = useT();
  const [state, formAction, pending] = useActionState(loginAction, emptyFormState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage state={state} />

      <Input
        name="email"
        type="email"
        autoComplete="email"
        required
        label={t("auth.field.email")}
        error={state.fieldErrors?.email ? t(state.fieldErrors.email) : undefined}
      />

      <PasswordInput
        name="password"
        autoComplete="current-password"
        required
        label={t("auth.field.password")}
        error={state.fieldErrors?.password ? t(state.fieldErrors.password) : undefined}
      />

      <div className="flex items-center justify-between gap-3">
        <Checkbox name="rememberMe" label={t("auth.login.remember")} />
        <Link
          href="/forgot-password"
          className="text-small font-medium text-primary underline-offset-2 hover:underline"
        >
          {t("auth.login.forgot")}
        </Link>
      </div>

      <Button type="submit" fullWidth size="lg" loading={pending}>
        {t("auth.login.submit")}
      </Button>
    </form>
  );
}
