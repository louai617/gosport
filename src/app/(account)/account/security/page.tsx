import type { Metadata } from "next";
import { KeyRound, Monitor, ShieldHalf } from "lucide-react";
import { getUserProfile } from "@/services/userService";
import { getRequestLocale, getT } from "@/i18n/server";
import { formatDateTime } from "@/lib/format";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("account.security.title") };
}

export default async function SecurityPage() {
  const [t, locale, user] = await Promise.all([getT(), getRequestLocale(), getUserProfile()]);

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-h1 text-ink">{t("account.security.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">{t("account.security.description")}</p>
      </header>

      <Alert tone="warning" title={t("common.demo.badge")}>
        {t("account.profile.saveNotice")}
      </Alert>

      <SecurityCard
        icon={<KeyRound size={18} />}
        title={t("account.security.password")}
        body={t("account.security.passwordBody")}
        action={
          <Button variant="secondary" size="sm" disabled>
            {t("account.security.changePassword")}
          </Button>
        }
      />

      <SecurityCard
        icon={<ShieldHalf size={18} />}
        title={t("account.security.twoFactor")}
        body={t("account.security.twoFactorBody")}
        action={
          <Badge tone={user.twoFactorEnabled ? "success" : "neutral"}>
            {user.twoFactorEnabled ? t("ui.yes") : t("ui.comingSoon")}
          </Badge>
        }
      />

      <SecurityCard
        icon={<Monitor size={18} />}
        title={t("account.security.sessions")}
        body={t("account.security.sessionsBody")}
      >
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line-soft bg-surface-2 px-3 py-2.5">
          <span className="text-small text-ink">{t("account.security.currentSession")}</span>
          <span className="numeric text-caption normal-case tracking-normal text-ink-subtle">
            {user.lastLoginAt ? formatDateTime(user.lastLoginAt, locale) : "—"}
          </span>
        </div>
      </SecurityCard>
    </div>
  );
}

function SecurityCard({
  icon,
  title,
  body,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 gap-3">
          <span
            aria-hidden="true"
            className="grid size-9 shrink-0 place-items-center rounded-lg border border-line-soft bg-surface-2 text-ink-subtle"
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="text-h3 text-ink">{title}</h2>
            <p className="mt-1 max-w-prose text-small leading-relaxed text-ink-muted">
              {body}
            </p>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
