import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { flattenParams, transactionListQuery } from "@/lib/adminQueries";
import { formatAmount, formatDateTime, formatNumber } from "@/lib/format";
import { getAdminT, getRequestLocale } from "@/i18n/server";
import { requirePageAdmin } from "@/server/auth/pageGuard";
import { getAdminTransactions } from "@/services/adminService";
import { getManagerDetail } from "@/services/managerService";
import { StatTile } from "@/components/account/StatTile";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { buttonStyles } from "@/components/ui/Button";
import { CreditForm } from "@/components/admin/CreditForm";
import { ManagerActions } from "@/components/admin/ManagerActions";
import { PLAYER_STATUS_TONE } from "@/components/admin/tones";
import { TransactionsList } from "@/components/wallet/TransactionsList";

export const metadata: Metadata = { title: "Manager" };

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminManagerPage({ params, searchParams }: PageProps) {
  const [{ id }, rawParams] = await Promise.all([params, searchParams]);
  await requirePageAdmin("managers.read");
  const raw = flattenParams(rawParams);

  const [t, locale, manager] = await Promise.all([getAdminT(), getRequestLocale(), getManagerDetail(id)]);
  if (!manager) notFound();

  const parsed = transactionListQuery.safeParse(raw);
  const q = parsed.success ? parsed.data : transactionListQuery.parse({});
  const transactions = await getAdminTransactions({ ...q, userId: id, pageSize: 10 });
  const money = (value: number) => formatAmount(value, locale);

  return (
    <div className="space-y-5">
      <Link href="/admin/managers" className="inline-flex items-center gap-1.5 text-small text-ink-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden="true" className="flip-rtl" />
        {t("admin.managers.title")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-3 text-h1 text-ink">
            {manager.username}
            <Badge tone={PLAYER_STATUS_TONE[manager.status]} size="md" dot>
              {t(`admin.userStatus.${manager.status}`)}
            </Badge>
          </h1>
          <p className="mt-1 text-small text-ink-muted">
            {manager.displayName} · {t("admin.managers.since", { date: formatDateTime(manager.createdAt, locale) })}
          </p>
        </div>
        <div className="text-end">
          <p className="text-caption uppercase text-ink-subtle">{t("admin.column.balance")}</p>
          <p className="numeric text-display font-bold text-ink">{money(manager.balance)}</p>
        </div>
      </header>

      {manager.suspendedReason && manager.status === "suspended" ? (
        <Alert tone="warning" title={t("admin.players.suspendedBecause")}>
          {manager.suspendedReason}
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t("admin.managers.issued")} value={money(manager.issued)} hint={t("admin.metric.lifetime")} />
        <StatTile label={t("admin.managers.sold")} value={money(manager.sold)} hint={t("admin.metric.lifetime")} />
        <StatTile label={t("admin.column.players")} value={formatNumber(manager.playerCount, locale)} />
        <StatTile
          label={t("admin.players.activeSessions")}
          value={formatNumber(manager.activeSessions, locale)}
          hint={manager.mustChangePassword ? t("admin.managers.mustChange") : undefined}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {manager.status === "active" ? (
            <section aria-labelledby="issue" className="rounded-xl border border-line bg-surface p-5">
              <h2 id="issue" className="text-h3 text-ink">{t("admin.credit.issueTitle")}</h2>
              <p className="mb-4 mt-1 text-small text-ink-muted">{t("admin.credit.issueBody")}</p>
              <CreditForm mode="issue" accountId={manager.id} username={manager.username} />
            </section>
          ) : null}

          <section aria-labelledby="recent" className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 id="recent" className="text-h3 text-ink">{t("admin.managers.recent")}</h2>
              <Link href={`/admin/players?manager=${manager.id}`} className={buttonStyles({ variant: "secondary", size: "sm" })}>
                {t("admin.managers.viewPlayers", { count: manager.playerCount })}
              </Link>
            </div>
            <TransactionsList
              basePath={`/admin/managers/${manager.id}`}
              variant="admin"
              data={transactions}
              params={{ sort: raw.sort, direction: raw.direction === "asc" ? "asc" : raw.direction === "desc" ? "desc" : undefined }}
            />
          </section>
        </div>

        <div className="rounded-xl border border-line bg-surface p-5">
          <ManagerActions manager={{ id: manager.id, username: manager.username, status: manager.status }} />
        </div>
      </div>
    </div>
  );
}
