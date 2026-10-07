import type { Metadata } from "next";
import { JURISDICTION } from "@/config/app.config";
import { getUserProfile } from "@/services/userService";
import { getRequestLocale, getT } from "@/i18n/server";
import { formatDate, formatPhone } from "@/lib/format";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { ProfileForm } from "@/components/account/ProfileForm";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("account.profile.title") };
}

export default async function ProfilePage() {
  const [t, locale, user] = await Promise.all([getT(), getRequestLocale(), getUserProfile()]);

  const rows = [
    { label: t("auth.field.username"), value: user.username },
    { label: t("auth.field.firstName"), value: user.firstName },
    { label: t("auth.field.lastName"), value: user.lastName },
    { label: t("auth.field.email"), value: user.email, verified: user.emailVerified },
    { label: t("auth.field.dateOfBirth"), value: user.dateOfBirth ? formatDate(user.dateOfBirth, locale) : "—" },
    { label: t("auth.field.country"), value: t(`countries.${user.countryCode}`) },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-h1 text-ink">{t("account.profile.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">{t("account.profile.description")}</p>
      </header>

      <div className="flex items-center gap-4 rounded-xl border border-line bg-surface p-4">
        <Avatar name={user.displayName} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-h3 text-ink">{user.displayName}</p>
          <p className="numeric mt-0.5 text-small text-ink-muted">
            {t("account.profile.memberSince", { date: formatDate(user.createdAt, locale) })}
          </p>
        </div>
      </div>

      {user.kycStatus !== "verified" ? (
        <Alert tone="warning" title={t("account.kyc.title")}>
          {t(`account.kyc.${user.kycStatus}`)}
        </Alert>
      ) : null}

      <section aria-labelledby="personal-heading">
        <h2 id="personal-heading" className="mb-3 text-h2 text-ink">
          {t("account.profile.personal")}
        </h2>

        <dl className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-surface">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <dt className="text-small text-ink-muted">{row.label}</dt>
              <dd className="flex items-center gap-2 text-small font-medium text-ink">
                <span className="numeric">{row.value}</span>
                {row.verified === undefined ? null : row.verified ? (
                  <Badge tone="success">{t("account.profile.verified")}</Badge>
                ) : (
                  <Badge tone="warning">{t("account.profile.unverified")}</Badge>
                )}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 text-caption normal-case tracking-normal text-ink-subtle">
          {t("account.profile.saveNotice")}
        </p>
      </section>

      <section aria-labelledby="edit-heading">
        <h2 id="edit-heading" className="mb-3 text-h2 text-ink">
          {t("account.profile.edit")}
        </h2>
        <ProfileForm displayName={user.displayName} phone={user.phone} />
      </section>

      <section aria-labelledby="prefs-heading">
        <h2 id="prefs-heading" className="mb-3 text-h2 text-ink">
          {t("account.profile.preferences")}
        </h2>

        <dl className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-surface">
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <dt className="text-small text-ink-muted">{t("nav.language")}</dt>
            <dd className="text-small font-medium text-ink">{t(`countries.${JURISDICTION.code}`)}</dd>
          </div>
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <dt className="text-small text-ink-muted">{t("currency.TND")}</dt>
            <dd className="numeric text-small font-medium text-ink">{JURISDICTION.currency}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
