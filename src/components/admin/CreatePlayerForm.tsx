"use client";

import Link from "next/link";
import { useState } from "react";
import { createPlayerAction } from "@/app/actions/admin";
import { useFormAction } from "@/lib/useFormAction";
import { JURISDICTION } from "@/config/app.config";
import { LOCALE_META } from "@/i18n/config";
import { useT } from "@/i18n/I18nProvider";
import { Alert } from "@/components/ui/Alert";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { OneTimeLink } from "./OneTimeLink";

const COUNTRIES = ["TN", "DZ", "MA", "FR", "IT", "DE"] as const;
const LOCALES = ["fr", "ar", "en"] as const;

/** A strong random password, generated in the browser and never sent anywhere but the form. */
function generatePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const body = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `${body}-7a`;
}

export function CreatePlayerForm() {
  const t = useT();
  const { state, pending, formProps } = useFormAction(createPlayerAction);
  const [mode, setMode] = useState<"invitation" | "password">("invitation");
  const [password, setPassword] = useState("");

  const fieldError = (name: string) =>
    state.fieldErrors?.[name] ? t(state.fieldErrors[name]) : undefined;

  if (state.ok && state.data) {
    const link = state.data.invitationLink as string | null;
    return (
      <div className="space-y-4 rounded-xl border border-line bg-surface p-5">
        <Alert tone="success" title={t("admin.players.created")}>
          {t("admin.players.createdBody", { username: String(state.data.username) })}
        </Alert>

        {link ? (
          <div className="space-y-2">
            <h2 className="text-h3 text-ink">{t("admin.players.invitationTitle")}</h2>
            <p className="text-small text-ink-muted">
              {state.data.delivered ? t("admin.players.invitationSent") : t("admin.players.invitationManual")}
            </p>
            <OneTimeLink link={link} />
            <p className="text-caption normal-case tracking-normal text-warning">
              {t("admin.link.shownOnce")}
            </p>
          </div>
        ) : (
          <p className="text-small text-ink-muted">{t("admin.players.passwordNote")}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <Link href={`/admin/players/${state.data.playerId}`} className={buttonStyles()}>
            {t("admin.players.openProfile")}
          </Link>
          <Link href="/admin/players/new" className={buttonStyles({ variant: "secondary" })}>
            {t("admin.players.createAnother")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form {...formProps} className="space-y-5 rounded-xl border border-line bg-surface p-5" noValidate>
      {state.messageKey && !state.ok ? <Alert tone="danger">{t(state.messageKey)}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Input name="username" required autoCapitalize="none" label={t("auth.field.username")} hint={t("auth.field.usernameHint")} error={fieldError("username")} />
        <Input name="email" type="email" required label={t("auth.field.email")} error={fieldError("email")} />
        <Input name="firstName" required label={t("auth.field.firstName")} error={fieldError("firstName")} />
        <Input name="lastName" required label={t("auth.field.lastName")} error={fieldError("lastName")} />
        <Input
          name="phone"
          type="tel"
          label={`${t("auth.field.phone")} (${t("ui.optional")})`}
          hint={t("auth.field.phoneHint", { code: JURISDICTION.phoneCallingCode })}
          error={fieldError("phone")}
        />
        <Select
          name="country"
          defaultValue={JURISDICTION.code}
          label={t("auth.field.country")}
          error={fieldError("country")}
          options={COUNTRIES.map((code) => ({ value: code, label: t(`countries.${code}`) }))}
        />
        <Select
          name="locale"
          defaultValue="fr"
          label={t("admin.players.language")}
          options={LOCALES.map((code) => ({ value: code, label: LOCALE_META[code].label }))}
        />
      </div>

      <fieldset className="space-y-3">
        <legend className="text-small font-semibold text-ink">{t("admin.players.credentials")}</legend>
        <input type="hidden" name="credentialMode" value={mode} />

        {(["invitation", "password"] as const).map((value) => (
          <label
            key={value}
            className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors duration-fast ${
              mode === value ? "border-primary bg-primary-soft/40" : "border-line hover:border-line-strong"
            }`}
          >
            <input
              type="radio"
              name="credentialModeChoice"
              checked={mode === value}
              onChange={() => setMode(value)}
              className="mt-1 accent-[var(--color-primary)]"
            />
            <span>
              <span className="block text-small font-semibold text-ink">
                {t(`admin.players.mode.${value}`)}
                {value === "invitation" ? (
                  <span className="ms-2 text-caption font-normal text-primary">{t("admin.players.recommended")}</span>
                ) : null}
              </span>
              <span className="block text-caption normal-case leading-relaxed tracking-normal text-ink-muted">
                {t(`admin.players.mode.${value}Body`)}
              </span>
            </span>
          </label>
        ))}

        {mode === "password" ? (
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Input
                name="temporaryPassword"
                autoComplete="off"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                label={t("admin.players.temporaryPassword")}
                hint={t("admin.players.temporaryPasswordHint")}
                error={fieldError("temporaryPassword")}
              />
            </div>
            <Button type="button" variant="secondary" onClick={() => setPassword(generatePassword())}>
              {t("admin.players.generate")}
            </Button>
          </div>
        ) : null}
      </fieldset>

      <Button type="submit" size="lg" loading={pending}>
        {t("admin.players.create")}
      </Button>
    </form>
  );
}
