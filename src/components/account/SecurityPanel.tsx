import { KeyRound, Monitor, ShieldHalf } from "lucide-react";
import { getRequestLocale, getT } from "@/i18n/server";
import { formatDateTime } from "@/lib/format";
import { listOwnSessions } from "@/services/authService";
import { getUserProfile } from "@/services/userService";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { SessionsList } from "./SessionsList";

/**
 * Password, sign-in history and live sessions — shared by the player's account
 * and the administrator's console, because the controls are the same: a
 * credential you can rotate and sessions you can end.
 */
export async function SecurityPanel({ forced }: { forced: boolean }) {
  const [t, locale, user, sessions] = await Promise.all([
    getT(),
    getRequestLocale(),
    getUserProfile(),
    listOwnSessions(),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-h1 text-ink">{t("account.security.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">{t("account.security.description")}</p>
      </header>

      {forced ? (
        <Alert tone="warning" title={t("account.security.forcedTitle")}>
          {t("account.security.forcedBody")}
        </Alert>
      ) : null}

      <Card
        icon={<KeyRound size={18} />}
        title={t("account.security.password")}
        body={t("account.security.passwordBody")}
      >
        <ChangePasswordForm />
      </Card>

      <Card
        icon={<ShieldHalf size={18} />}
        title={t("account.security.twoFactor")}
        body={t("account.security.twoFactorBody")}
        action={<Badge tone="neutral">{t("ui.comingSoon")}</Badge>}
      />

      <Card
        icon={<Monitor size={18} />}
        title={t("account.security.sessions")}
        body={t("account.security.sessionsBody")}
      >
        <p className="numeric mt-2 text-caption normal-case tracking-normal text-ink-subtle">
          {t("account.security.lastSignIn", {
            date: user.lastLoginAt ? formatDateTime(user.lastLoginAt, locale) : "—",
          })}
        </p>
        <SessionsList sessions={sessions} />
      </Card>
    </div>
  );
}

function Card({
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
            <p className="mt-1 max-w-prose text-small leading-relaxed text-ink-muted">{body}</p>
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}
