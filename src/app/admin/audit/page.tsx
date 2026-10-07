import type { Metadata } from "next";
import Link from "next/link";
import { auditListQuery, flattenParams } from "@/lib/adminQueries";
import { formatDateTime } from "@/lib/format";
import { getAdminT, getRequestLocale } from "@/i18n/server";
import { requirePageAdmin } from "@/server/auth/pageGuard";
import { listAuditActions, listAuditActors, listAuditLogs } from "@/services/auditService";
import { Badge } from "@/components/ui/Badge";
import { AdminFilters, UrlPagination } from "@/components/admin/AdminFilters";
import { TBody, TD, TH, THead, TR, Table, TableEmpty } from "@/components/ui/Table";

export const metadata: Metadata = { title: "Audit log" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const SEVERITY_TONE = { info: "neutral", warning: "warning", critical: "danger" } as const;

export default async function AdminAuditPage({ searchParams }: PageProps) {
  await requirePageAdmin("audit.read");
  const raw = flattenParams(await searchParams);
  const parsed = auditListQuery.safeParse(raw);
  const q = parsed.success ? parsed.data : auditListQuery.parse({});

  const [t, locale, logs, actions, actors] = await Promise.all([
    getAdminT(),
    getRequestLocale(),
    listAuditLogs(q),
    listAuditActions(),
    listAuditActors(),
  ]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-h1 text-ink">{t("admin.audit.title")}</h1>
        <p className="mt-1 max-w-prose text-small text-ink-muted">{t("admin.audit.description")}</p>
      </header>

      <AdminFilters
        basePath="/admin/audit"
        search={false}
        values={raw}
        selects={[
          { param: "actor", label: t("admin.audit.filter.admin"), options: actors.map((a) => ({ value: a.id, label: a.username })) },
          { param: "action", label: t("admin.audit.column.action"), options: actions.map((a) => ({ value: a, label: t(`admin.audit.action.${a}`) })) },
          { param: "severity", label: t("admin.column.severity"), options: (["info", "warning", "critical"] as const).map((v) => ({ value: v, label: t(`admin.severity.${v}`) })) },
          { param: "outcome", label: t("admin.audit.filter.outcome"), options: (["success", "failure", "blocked"] as const).map((v) => ({ value: v, label: t(`admin.audit.outcome.${v}`) })) },
        ]}
        texts={[
          { param: "player", label: t("admin.column.player"), placeholder: t("admin.audit.filter.playerHint") },
          { param: "transactionId", label: t("admin.audit.filter.transaction") },
          { param: "ip", label: t("admin.audit.column.ip") },
        ]}
        dates
      />

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <Table>
          <THead>
            <tr>
              <TH>{t("wallet.column.date")}</TH>
              <TH>{t("admin.audit.column.action")}</TH>
              <TH>{t("admin.audit.filter.admin")}</TH>
              <TH>{t("admin.column.player")}</TH>
              <TH>{t("wallet.column.description")}</TH>
              <TH align="end">{t("admin.audit.column.ip")}</TH>
            </tr>
          </THead>
          <TBody>
            {logs.items.length === 0 ? (
              <TableEmpty colSpan={6} title={t("admin.audit.empty")} />
            ) : (
              logs.items.map((row) => (
                <TR key={row.id}>
                  <TD numeric className="whitespace-nowrap text-ink-muted">{formatDateTime(row.createdAt, locale, { second: "2-digit" })}</TD>
                  <TD>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={SEVERITY_TONE[row.severity]} dot>{t(`admin.audit.action.${row.action}`)}</Badge>
                      {row.outcome !== "success" ? <Badge tone="danger">{t(`admin.audit.outcome.${row.outcome}`)}</Badge> : null}
                    </span>
                  </TD>
                  <TD>{row.actorUsername ?? <span className="text-ink-subtle">{row.actorRole ? t("admin.audit.unknownActor") : t("admin.audit.system")}</span>}</TD>
                  <TD>
                    {row.targetUserId ? (
                      <Link href={`/admin/players/${row.targetUserId}?tab=activity`} className="font-medium text-primary hover:underline">
                        {row.targetUsername ?? row.targetUserId}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="max-w-md">
                    <span className="block truncate" title={row.description}>{row.description}</span>
                    {row.transactionId ? (
                      <Link
                        href={`/admin/transactions?search=${row.transactionId}`}
                        className="numeric text-caption normal-case tracking-normal text-primary hover:underline"
                      >
                        {t("admin.audit.viewTransaction")}
                      </Link>
                    ) : null}
                  </TD>
                  <TD align="end" numeric className="text-ink-subtle">{row.ip ?? "—"}</TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </div>
      <UrlPagination basePath="/admin/audit" page={logs.page} pageSize={logs.pageSize} total={logs.total} />
    </div>
  );
}
