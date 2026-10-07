"use client";

import { useActionState } from "react";
import { Monitor } from "lucide-react";
import { revokeOtherSessionsAction, revokeSessionAction } from "@/app/actions/auth";
import { emptyActionState } from "@/lib/actionState";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/i18n/I18nProvider";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export interface SessionItem {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
  current: boolean;
}

/** A short, human label from a user-agent string — enough to recognise a device. */
function deviceLabel(userAgent: string | null): string {
  if (!userAgent) return "—";
  const browser =
    /Edg\//.test(userAgent) ? "Edge" :
    /Firefox\//.test(userAgent) ? "Firefox" :
    /Chrome\//.test(userAgent) ? "Chrome" :
    /Safari\//.test(userAgent) ? "Safari" : "Browser";
  const system =
    /iPhone|iPad/.test(userAgent) ? "iOS" :
    /Android/.test(userAgent) ? "Android" :
    /Windows/.test(userAgent) ? "Windows" :
    /Mac OS X/.test(userAgent) ? "macOS" :
    /Linux/.test(userAgent) ? "Linux" : "";
  return system ? `${browser} · ${system}` : browser;
}

export function SessionsList({ sessions }: { sessions: SessionItem[] }) {
  const { t, locale } = useI18n();
  const [revoked, revokeAction, revoking] = useActionState(revokeSessionAction, emptyActionState);
  const [others, othersAction, revokingOthers] = useActionState(
    async () => revokeOtherSessionsAction(),
    emptyActionState,
  );

  const hasOthers = sessions.some((session) => !session.current);

  return (
    <div className="mt-3 space-y-2">
      {revoked.messageKey || others.messageKey ? (
        <Alert tone="success">{t((others.messageKey ?? revoked.messageKey)!)}</Alert>
      ) : null}

      <ul className="space-y-2">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line-soft bg-surface-2 px-3 py-2.5"
          >
            <span className="flex min-w-0 items-center gap-2.5">
              <Monitor size={15} aria-hidden="true" className="shrink-0 text-ink-subtle" />
              <span className="min-w-0">
                <span className="block truncate text-small text-ink">
                  {deviceLabel(session.userAgent)}
                </span>
                <span className="numeric block text-caption normal-case tracking-normal text-ink-subtle">
                  {t("account.security.lastActive", { date: formatDateTime(session.lastSeenAt, locale) })}
                </span>
              </span>
            </span>

            {session.current ? (
              <Badge tone="success">{t("account.security.currentSession")}</Badge>
            ) : (
              <form action={revokeAction}>
                <input type="hidden" name="sessionId" value={session.id} />
                <Button type="submit" variant="ghost" size="sm" loading={revoking}>
                  {t("account.security.revoke")}
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>

      {hasOthers ? (
        <form action={othersAction}>
          <Button type="submit" variant="secondary" size="sm" loading={revokingOthers}>
            {t("account.security.revokeOthers")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
