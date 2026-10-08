"use client";

import { useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { useT } from "@/i18n/I18nProvider";
import { Button } from "@/components/ui/Button";

/**
 * A username and a freshly generated password, shown to the operator exactly
 * once. The server keeps only the password's Argon2id hash, so this is the only
 * moment it can be read; the page says so plainly. Both values are read-only,
 * selectable and copyable — copy both at once to paste into a message.
 */
export function CredentialsReveal({
  username,
  password,
}: {
  username: string;
  password: string;
}) {
  const t = useT();
  const [copied, setCopied] = useState<"username" | "password" | "both" | null>(null);

  const copy = async (what: "username" | "password" | "both") => {
    const value =
      what === "username"
        ? username
        : what === "password"
          ? password
          : `${t("auth.field.username")}: ${username}\n${t("auth.field.password")}: ${password}`;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard blocked: the fields are selectable, so the operator can copy by hand.
    }
  };

  const row = (label: string, value: string, what: "username" | "password") => (
    <div className="grid gap-1.5 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center">
      <span className="text-small text-ink-muted">{label}</span>
      <input
        readOnly
        dir="ltr"
        value={value}
        onFocus={(event) => event.currentTarget.select()}
        aria-label={label}
        className="numeric h-10 min-w-0 rounded-md border border-line bg-surface-2 px-3 text-body font-semibold tracking-wide text-ink"
      />
      <Button type="button" variant="secondary" size="sm" onClick={() => copy(what)}>
        {copied === what ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
        {copied === what ? t("admin.credentials.copied") : t("admin.credentials.copy")}
      </Button>
    </div>
  );

  return (
    <section
      aria-labelledby="credentials-heading"
      className="space-y-3 rounded-xl border border-primary/30 bg-primary-soft/30 p-4"
    >
      <h2 id="credentials-heading" className="flex items-center gap-2 text-h3 text-ink">
        <KeyRound size={17} aria-hidden="true" className="text-primary" />
        {t("admin.credentials.title")}
      </h2>
      {row(t("auth.field.username"), username, "username")}
      {row(t("auth.field.password"), password, "password")}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption normal-case tracking-normal text-warning">
          {t("admin.credentials.shownOnce")}
        </p>
        <Button type="button" size="sm" onClick={() => copy("both")}>
          {copied === "both" ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
          {copied === "both" ? t("admin.credentials.copied") : t("admin.credentials.copyBoth")}
        </Button>
      </div>
    </section>
  );
}
