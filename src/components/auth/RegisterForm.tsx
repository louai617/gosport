"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { JURISDICTION } from "@/config/app.config";
import { registerAction } from "@/app/actions/auth";
import { emptyActionState } from "@/lib/actionState";
import { passwordStrength } from "@/lib/validation";
import { useT } from "@/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Select } from "@/components/ui/Select";
import { FormMessage } from "./FormMessage";

const COUNTRY_OPTIONS = ["TN", "DZ", "MA", "FR", "IT", "DE"] as const;

/**
 * Registration.
 *
 * The age control deserves a note: the checkbox and the date field together
 * are an *input check*, not verification. The copy under them says so, and
 * `docs/COMPLIANCE.md` records that a licensed provider must confirm the date
 * of birth before the account can stake or deposit. Nothing in this form may
 * be styled or worded to imply the visitor has been verified.
 */
export function RegisterForm() {
  const t = useT();
  const [state, formAction, pending] = useActionState(registerAction, emptyActionState);
  const [password, setPassword] = useState("");

  const fieldError = (name: string) =>
    state.fieldErrors?.[name] ? t(state.fieldErrors[name]) : undefined;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormMessage state={state} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          name="firstName"
          autoComplete="given-name"
          required
          label={t("auth.field.firstName")}
          error={fieldError("firstName")}
        />
        <Input
          name="lastName"
          autoComplete="family-name"
          required
          label={t("auth.field.lastName")}
          error={fieldError("lastName")}
        />
      </div>

      <Input
        name="username"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        label={t("auth.field.username")}
        hint={t("auth.field.usernameHint")}
        error={fieldError("username")}
      />

      <Input
        name="email"
        type="email"
        autoComplete="email"
        required
        label={t("auth.field.email")}
        error={fieldError("email")}
      />

      <Input
        name="phone"
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required
        label={t("auth.field.phone")}
        hint={t("auth.field.phoneHint", { code: JURISDICTION.phoneCallingCode })}
        error={fieldError("phone")}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <PasswordInput
          name="password"
          autoComplete="new-password"
          required
          label={t("auth.field.password")}
          hint={t("auth.field.passwordHint")}
          strength={passwordStrength(password)}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldError("password")}
        />
        <PasswordInput
          name="confirmPassword"
          autoComplete="new-password"
          required
          label={t("auth.field.confirmPassword")}
          error={fieldError("confirmPassword")}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          name="dateOfBirth"
          type="date"
          required
          label={t("auth.field.dateOfBirth")}
          error={fieldError("dateOfBirth")}
        />
        <Select
          name="country"
          required
          defaultValue={JURISDICTION.code}
          label={t("auth.field.country")}
          error={fieldError("country")}
          options={COUNTRY_OPTIONS.map((code) => ({
            value: code,
            label: t(`countries.${code}`),
          }))}
        />
      </div>

      <div className="space-y-3 rounded-lg border border-line bg-surface-2/50 p-3.5">
        <p className="flex items-center gap-2 text-small font-semibold text-ink">
          <span
            aria-hidden="true"
            className="numeric grid size-6 shrink-0 place-items-center rounded-full border-2 border-danger text-[10px] font-bold text-danger"
          >
            18+
          </span>
          {t("auth.age.heading")}
        </p>

        <Checkbox
          name="ageConfirmed"
          required
          label={t("auth.age.confirm", { age: JURISDICTION.legalAge })}
          error={fieldError("ageConfirmed")}
        />

        {/* Stated plainly, next to the box, not in a footnote. */}
        <p className="text-caption normal-case leading-relaxed tracking-normal text-ink-subtle">
          {t("auth.age.notVerification")}
        </p>
      </div>

      <Checkbox
        name="termsAccepted"
        required
        error={fieldError("termsAccepted")}
        label={
          <>
            {t("auth.terms.accept")}{" "}
            <Link
              href="/legal/terms"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {t("footer.terms")}
            </Link>{" "}
            {t("ui.and")}{" "}
            <Link
              href="/legal/privacy"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {t("footer.privacy")}
            </Link>
          </>
        }
      />

      <Checkbox name="marketingOptIn" label={t("auth.marketing.optIn")} />

      <Button type="submit" fullWidth size="lg" loading={pending}>
        {t("auth.register.submit")}
      </Button>
    </form>
  );
}
