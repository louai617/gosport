import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldOff } from "lucide-react";
import { flattenParams, transactionListQuery } from "@/lib/adminQueries";
import { formatAmount, formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/cn";
import { getAdminT, getRequestLocale } from "@/i18n/server";
import { requirePageAdmin } from "@/server/auth/pageGuard";
import { can } from "@/server/auth/permissions";
import { getSetting } from "@/server/settings/settingsService";
import { getAdminTransactions } from "@/services/adminService";
import { getAdminBets } from "@/services/bettingService";
import {
  getPlayerActivity,
  getPlayerDetail,
  getPlayerResponsibleGaming,
} from "@/services/playerAdminService";
import { getPlayerWalletSummary } from "@/services/walletAdminService";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { StatTile } from "@/components/account/StatTile";
import { AdjustmentForm } from "@/components/admin/AdjustmentForm";
import { AdminBetsTable } from "@/components/admin/AdminBetsTable";
import { PlayerActions } from "@/components/admin/PlayerActions";
import { KYC_TONE, PLAYER_STATUS_TONE } from "@/components/admin/tones";
import { TransactionsList } from "@/components/wallet/TransactionsList";
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from "@/components/ui/Table";

export const metadata: Metadata = { title: "Player" };

const TABS = ["overview", "wallet", "transactions", "bets", "activity", "responsible"] as const;
type Tab = (typeof TABS)[number];

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminPlayerPage({ params, searchParams }: PageProps) {
  const [{ id }, rawParams] = await Promise.all([params, searchParams]);
  const user = await requirePageAdmin("players.read");
  const raw = flattenParams(rawParams);
  const tab: Tab = (TABS as readonly string[]).includes(raw.tab ?? "") ? (raw.tab as Tab) : "overview";

  const [t, locale, player] = await Promise.all([getAdminT(), getRequestLocale(), getPlayerDetail(id)]);
  if (!player) notFound();

  const allow = {
    update: can(user.role, "players.update"),
    suspend: can(user.role, "players.suspend"),
    credentials: can(user.role, "players.credentials"),
    sessions: can(user.role, "players.sessions.revoke"),
  };

  return (
    <div className="space-y-5">
      <Link href="/admin/players" className="inline-flex items-center gap-1.5 text-small text-ink-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden="true" className="flip-rtl" />
        {t("admin.players.title")}
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-3 text-h1 text-ink">
            {player.username}
            <Badge tone={PLAYER_STATUS_TONE[player.status]} size="md" dot>
              {t(`admin.userStatus.${player.status}`)}
            </Badge>
            {player.wageringBlocked || player.withdrawalsBlocked ? (
              <Badge tone="warning" size="md">
                <ShieldOff size={12} aria-hidden="true" /> {t("admin.players.restricted")}
              </Badge>
            ) : null}
          </h1>
          <p className="mt-1 text-small text-ink-muted">
            {player.displayName} · {player.email}
          </p>
          <p className="numeric mt-0.5 text-caption normal-case tracking-normal text-ink-subtle">
            {t("admin.players.id")}: {player.id}
          </p>
        </div>
        <div className="text-end">
          <p className="text-caption uppercase text-ink-subtle">{t("admin.column.balance")}</p>
          <p className="numeric text-display font-bold text-ink">{formatAmount(player.balance, locale)}</p>
        </div>
      </header>

      {player.suspendedReason && (player.status === "suspended" || player.status === "locked") ? (
        <Alert tone="warning" title={t("admin.players.suspendedBecause")}>
          {player.suspendedReason}
        </Alert>
      ) : null}

      <nav aria-label={t("admin.players.sections")} className="scroll-slim overflow-x-auto">
        <ul className="flex gap-1 border-b border-line">
          {TABS.map((value) => (
            <li key={value}>
              <Link
                href={`/admin/players/${id}?tab=${value}`}
                aria-current={tab === value ? "page" : undefined}
                className={cn(
                  "-mb-px block whitespace-nowrap border-b-2 px-3 py-2 text-small transition-colors duration-fast",
                  tab === value
                    ? "border-primary font-semibold text-ink"
                    : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                {t(`admin.players.tab.${value}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "overview" ? (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <dl className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-surface">
            {[
              [t("admin.players.id"), player.id],
              [t("auth.field.username"), player.username],
              [t("auth.field.email"), `${player.email}${player.emailVerifiedAt ? "" : ` · ${t("account.profile.unverified")}`}`],
              [t("auth.field.phone"), player.phone ?? "—"],
              [t("auth.field.firstName"), `${player.firstName} ${player.lastName}`],
              [t("auth.field.country"), t(`countries.${player.countryCode}`)],
              [t("auth.field.dateOfBirth"), player.dateOfBirth ? formatDate(player.dateOfBirth, locale) : "—"],
              [t("admin.column.registered"), formatDateTime(player.createdAt, locale)],
              [t("admin.column.lastSeen"), player.lastLoginAt ? formatDateTime(player.lastLoginAt, locale) : "—"],
              [t("admin.players.createdBy"), player.createdBy ?? t("admin.players.selfRegistered")],
              [t("admin.players.activeSessions"), String(player.activeSessions)],
              [t("admin.players.failedLogins"), String(player.failedLoginCount)],
              [t("admin.players.mustChange"), player.mustChangePassword ? t("ui.yes") : t("ui.no")],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5">
                <dt className="text-small text-ink-muted">{label}</dt>
                <dd className="numeric text-small font-medium text-ink">{value}</dd>
              </div>
            ))}
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5">
              <dt className="text-small text-ink-muted">{t("admin.column.kyc")}</dt>
              <dd>
                <Badge tone={KYC_TONE[player.kycStatus]}>{t(`admin.kyc.${player.kycStatus}`)}</Badge>
              </dd>
            </div>
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5">
              <dt className="text-small text-ink-muted">{t("admin.players.restrictions")}</dt>
              <dd className="text-small font-medium text-ink">
                {player.wageringBlocked || player.withdrawalsBlocked
                  ? [
                      player.wageringBlocked ? t("admin.players.blockWagering") : null,
                      player.withdrawalsBlocked ? t("admin.players.blockWithdrawals") : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                  : t("admin.players.noRestrictions")}
              </dd>
            </div>
          </dl>

          <PlayerActions player={player} can={allow} />
        </div>
      ) : null}

      {tab === "wallet" ? <WalletTab playerId={id} username={player.username} canAdjust={can(user.role, "wallet.adjust")} /> : null}

      {tab === "transactions" ? <TransactionsTab playerId={id} raw={raw} /> : null}

      {tab === "bets" ? <BetsTab playerId={id} /> : null}

      {tab === "activity" ? <ActivityTab playerId={id} page={Number(raw.page) || 1} /> : null}

      {tab === "responsible" ? <ResponsibleTab playerId={id} /> : null}
    </div>
  );
}

async function WalletTab({ playerId, username, canAdjust }: { playerId: string; username: string; canAdjust: boolean }) {
  const [t, locale, summary, allowed, maxAmount, threshold] = await Promise.all([
    getAdminT(),
    getRequestLocale(),
    getPlayerWalletSummary(playerId),
    getSetting("wallet.allowedAdjustmentTypes"),
    getSetting("wallet.maxAdjustmentAmount"),
    getSetting("wallet.adjustmentApprovalThreshold"),
  ]);
  const money = (value: number) => formatAmount(value, locale);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={t("admin.stat.balance")} value={money(summary.balance)} tone="primary" hint={t("admin.wallet.onHold", { amount: money(summary.reserved) })} />
        <StatTile label={t("admin.stat.deposits")} value={money(summary.deposits)} hint={t("admin.metric.lifetime")} />
        <StatTile label={t("admin.stat.withdrawals")} value={money(summary.withdrawals)} hint={t("admin.metric.lifetime")} />
        <StatTile label={t("admin.stat.bets")} value={money(summary.bets)} hint={t("admin.metric.lifetime")} />
        <StatTile label={t("admin.stat.wins")} value={money(summary.wins)} hint={t("admin.metric.lifetime")} />
        <StatTile label={t("admin.stat.refunds")} value={money(summary.refunds)} hint={t("admin.metric.lifetime")} />
        <StatTile label={t("admin.stat.bonuses")} value={money(summary.bonuses)} hint={t("admin.metric.lifetime")} />
        <StatTile label={t("admin.stat.adjustments")} value={money(summary.manualAdjustments)} hint={t("admin.metric.lifetimeNet")} />
      </div>

      <Alert tone={summary.integrity.consistent ? "success" : "danger"} title={t("admin.wallet.integrity")}>
        {summary.integrity.consistent
          ? t("admin.wallet.integrityOk", { entries: summary.integrity.entries })
          : t("admin.wallet.integrityBad", {
              balance: money(summary.integrity.balance),
              ledger: money(summary.integrity.ledgerSum),
            })}
      </Alert>

      {canAdjust ? (
        <section aria-labelledby="adjust" className="rounded-xl border border-line bg-surface p-5">
          <h2 id="adjust" className="text-h3 text-ink">{t("admin.wallet.adjustTitle")}</h2>
          <p className="mb-4 mt-1 text-small text-ink-muted">{t("admin.wallet.adjustBody")}</p>
          <AdjustmentForm
            playerId={playerId}
            username={username}
            allowedTypes={allowed}
            maxAmount={maxAmount}
            approvalThreshold={threshold}
          />
        </section>
      ) : null}
    </div>
  );
}

async function TransactionsTab({ playerId, raw }: { playerId: string; raw: Record<string, string | undefined> }) {
  const parsed = transactionListQuery.safeParse(raw);
  const q = parsed.success ? parsed.data : transactionListQuery.parse({});
  const data = await getAdminTransactions({ ...q, userId: playerId });

  return (
    <TransactionsList
      basePath={`/admin/players/${playerId}`}
      variant="admin"
      data={data}
      params={{
        search: raw.search,
        kind: raw.kind,
        status: raw.status,
        from: raw.from,
        to: raw.to,
        minAmount: raw.minAmount,
        maxAmount: raw.maxAmount,
        sort: raw.sort,
        direction: raw.direction === "asc" ? "asc" : raw.direction === "desc" ? "desc" : undefined,
      }}
    />
  );
}

async function BetsTab({ playerId }: { playerId: string }) {
  const bets = await getAdminBets({ userId: playerId, pageSize: 50 });
  return <AdminBetsTable bets={bets.items} canSettle={false} showPlayer={false} />;
}

async function ActivityTab({ playerId, page }: { playerId: string; page: number }) {
  const [t, locale, activity] = await Promise.all([getAdminT(), getRequestLocale(), getPlayerActivity(playerId, page, 25)]);
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <Table>
          <THead>
            <tr>
              <TH>{t("wallet.column.date")}</TH>
              <TH>{t("admin.audit.column.action")}</TH>
              <TH>{t("wallet.column.description")}</TH>
              <TH align="end">{t("admin.audit.column.ip")}</TH>
            </tr>
          </THead>
          <TBody>
            {activity.items.length === 0 ? (
              <TableEmpty colSpan={4} title={t("admin.activity.empty")} />
            ) : (
              activity.items.map((row) => (
                <TR key={row.id}>
                  <TD numeric className="whitespace-nowrap text-ink-muted">{formatDateTime(row.createdAt, locale)}</TD>
                  <TD>
                    <Badge tone={row.severity === "critical" ? "danger" : row.severity === "warning" ? "warning" : "neutral"}>
                      {t(`admin.audit.action.${row.action}`)}
                    </Badge>
                  </TD>
                  <TD className="max-w-md truncate">
                    {row.description}
                    {row.actorUsername ? <span className="text-ink-subtle"> · {row.actorUsername}</span> : null}
                  </TD>
                  <TD align="end" numeric className="text-ink-subtle">{row.ip ?? "—"}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>
      <div className="flex items-center justify-between text-small text-ink-muted">
        <span>{t("admin.pagination.page", { page: activity.page, pages: activity.totalPages })}</span>
        <span className="flex gap-3">
          {activity.page > 1 ? (
            <Link className="font-semibold text-primary" href={`/admin/players/${playerId}?tab=activity&page=${activity.page - 1}`}>
              {t("ui.previous")}
            </Link>
          ) : null}
          {activity.page < activity.totalPages ? (
            <Link className="font-semibold text-primary" href={`/admin/players/${playerId}?tab=activity&page=${activity.page + 1}`}>
              {t("ui.next")}
            </Link>
          ) : null}
        </span>
      </div>
    </div>
  );
}

async function ResponsibleTab({ playerId }: { playerId: string }) {
  const [t, locale, rg] = await Promise.all([getAdminT(), getRequestLocale(), getPlayerResponsibleGaming(playerId)]);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="space-y-2">
        <h2 className="text-h3 text-ink">{t("admin.rg.limits")}</h2>
        {rg.limits.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface p-4 text-small text-ink-subtle">{t("admin.rg.noLimits")}</p>
        ) : (
          <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-surface">
            {rg.limits.map((limit) => (
              <li key={limit.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                <span className="text-small text-ink">
                  {t(`responsible.limits.${limit.kind === "single_bet" ? "singleBet" : limit.kind}.title`)}
                  {limit.kind !== "single_bet" ? ` · ${t(`responsible.limits.period.${limit.period}`)}` : ""}
                </span>
                <span className="numeric text-small font-semibold text-ink">
                  {formatAmount(limit.used, locale)} / {formatAmount(limit.value, locale)}
                  {limit.pendingValue !== null ? (
                    <span className="ms-2 text-caption font-normal text-warning">→ {formatAmount(limit.pendingValue, locale)}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="space-y-2">
        <h2 className="text-h3 text-ink">{t("admin.rg.exclusions")}</h2>
        {rg.exclusions.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface p-4 text-small text-ink-subtle">{t("admin.rg.noExclusions")}</p>
        ) : (
          <ul className="divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-surface">
            {rg.exclusions.map((entry) => {
              const active = entry.endsAt === null || Date.parse(entry.endsAt) > Date.now();
              return (
                <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                  <span className="text-small text-ink">
                    {t(entry.kind === "cooling_off" ? "admin.rgCase.kind.coolingOff" : "admin.rgCase.kind.selfExclusion")}
                  </span>
                  <span className="numeric flex items-center gap-2 text-small text-ink-muted">
                    {formatDateTime(entry.startedAt, locale)} → {entry.endsAt ? formatDateTime(entry.endsAt, locale) : t("responsible.selfExclusion.permanent")}
                    <Badge tone={active ? "danger" : "neutral"}>{active ? t("admin.rg.active") : t("admin.rg.ended")}</Badge>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
