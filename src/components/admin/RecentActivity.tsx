"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Activity } from "lucide-react";
import type { ActivityItem } from "@/services/analyticsService";
import { cn } from "@/lib/cn";
import { formatAmount, formatDateTime } from "@/lib/format";
import { useI18n } from "@/i18n/I18nProvider";

const REFRESH_MS = 15_000;

const TONE: Record<ActivityItem["severity"], string> = {
  info: "bg-ink-subtle",
  warning: "bg-warning",
  critical: "bg-danger",
};

/**
 * "What is happening now": the newest sign-ups, sign-ins, wagers, ledger entries
 * and account changes. Polls the (permission-checked) activity endpoint every 15
 * seconds while the tab is visible — frequent enough to watch, cheap enough not
 * to need a websocket, and silent when hidden.
 */
export function RecentActivity({ initial }: { initial: ActivityItem[] }) {
  const { t, locale } = useI18n();
  const [items, setItems] = useState(initial);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/activity?limit=25", { cache: "no-store" });
      const body = (await response.json()) as { ok: boolean; data?: ActivityItem[] };
      if (body.ok && body.data) {
        setItems(body.data);
        setUpdatedAt(Date.now());
      }
    } catch {
      // A missed poll is not an error worth showing; the next one will catch up.
    }
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <section aria-labelledby="activity-heading" className="rounded-xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
        <h2 id="activity-heading" className="flex items-center gap-2 text-h3 text-ink">
          <Activity size={15} aria-hidden="true" className="text-ink-subtle" />
          {t("admin.activity.title")}
        </h2>
        <span className="text-caption normal-case tracking-normal text-ink-subtle" aria-live="off">
          {updatedAt ? t("admin.activity.updated") : t("admin.activity.live")}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-small text-ink-subtle">{t("admin.activity.empty")}</p>
      ) : (
        <ul className="scroll-slim max-h-[28rem] divide-y divide-line-soft overflow-y-auto">
          {items.map((item) => {
            const label = t(item.kind === "ledger" ? `wallet.kind.${item.code.toLowerCase()}` : `admin.audit.action.${item.code}`);
            const body = (
              <span className="flex items-start gap-2.5 px-4 py-2.5">
                <span aria-hidden="true" className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", TONE[item.severity])} />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className="truncate text-small text-ink">
                      {label}
                      {item.username ? <span className="text-ink-muted"> · {item.username}</span> : null}
                    </span>
                    {item.amount !== null ? (
                      <span
                        className={cn(
                          "numeric text-small font-semibold",
                          item.amount > 0 ? "text-success" : "text-ink",
                        )}
                      >
                        {item.amount > 0 ? "+" : ""}
                        {formatAmount(item.amount, locale)}
                      </span>
                    ) : null}
                  </span>
                  <span className="numeric block text-caption normal-case tracking-normal text-ink-subtle">
                    {formatDateTime(item.at, locale)}
                  </span>
                </span>
              </span>
            );

            return (
              <li key={item.id}>
                {item.href ? (
                  <Link href={item.href} className="block transition-colors duration-fast hover:bg-surface-2/60">
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
