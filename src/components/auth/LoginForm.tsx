"use client";


import Link from "next/link";
import { loginAction } from "@/app/actions/auth";
import { useFormAction } from "@/lib/useFormAction";
import { useT } from "@/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { FormMessage } from "./FormMessage";

export interface LoginFormProps {
  /** Where to go after signing in. Re-validated on the server before use. */
  next?: string;
}

export function LoginForm({ next }: LoginFormProps) {
  const t = useT();
  const { state, pending, formProps } = useFormAction(loginAction);

  return (
    <form {...formProps} className="space-y-4" noValidate>
      <FormMessage state={state} />
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <Input
        name="identifier"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        label={t("auth.field.identifier")}
        error={state.fieldErrors?.identifier ? t(state.fieldErrors.identifier) : undefined}
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
