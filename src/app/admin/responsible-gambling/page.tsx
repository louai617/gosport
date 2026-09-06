import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";
import { RESPONSIBLE_GAMBLING, compliance } from "@/config/app.config";
import { getResponsibleGamblingCases } from "@/services/adminService";
import { getAdminT, getRequestLocale } from "@/i18n/server";
import { formatDate } from "@/lib/format";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { AdminTableClient, type AdminRow } from "@/components/admin/AdminTableClient";
import { parseListQuery } from "@/lib/listQuery";
import type { BadgeTone } from "@/components/ui/Badge";

export const metadata: Metadata = { title: "Responsible gambling" };

const SEVERITY_TONE: Record<string, BadgeTone> = {
  high: "danger",
  medium: "warning",
  low: "info",
};

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function AdminResponsiblePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const list = parseListQuery(params);

  const [t, locale, cases] = await Promise.all([
    getAdminT(),
    getRequestLocale(),
    getResponsibleGamblingCases(list),
  ]);

  const rows: AdminRow[] = cases.items.map((entry) => ({
    id: entry.id,
    cells: {
      user: { text: entry.userName, sub: entry.userId },
      // The service emits a full i18n key for both fields.
      kind: { text: t(entry.kind) },
      detail: { text: t(entry.detail) },
      createdAt: { text: formatDate(entry.createdAt, locale) },
      severity: {
        text: entry.severity,
        badge: {
          label: t(`admin.severity.${entry.severity}`),
          tone: SEVERITY_TONE[entry.severity] ?? "neutral",
          dot: true,
        },
      },
    },
  }));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-h1 text-ink">{t("admin.responsible.title")}</h1>
        <p className="mt-1 max-w-prose text-small text-ink-muted">
          {t("admin.responsible.description")}
        </p>
      </header>

      <Alert tone="warning" title={t("common.demo.badge")}>
        {t("admin.responsible.demoNotice")}
      </Alert>

      <section className="grid gap-4 sm:grid-cols-3">
        <PolicyTile
          label={t("admin.responsible.policy.coolingOff")}
          value={t("responsible.limits.increaseDelayed", {
            hours: RESPONSIBLE_GAMBLING.limitIncreaseCoolingOffHours,
          })}
        />
        <PolicyTile
          label={t("admin.responsible.policy.realityCheck")}
          value={t("responsible.limits.minutes", {
            count: RESPONSIBLE_GAMBLING.realityCheckMinutes,
          })}
        />
        <PolicyTile
          label={t("admin.responsible.policy.register")}
          value={
            compliance.licence
              ? t("admin.responsible.policy.registerConnected")
              : t("admin.responsible.policy.registerMissing")
          }
        />
      </section>

      {cases.total === 0 ? (
        <div className="rounded-xl border border-line bg-surface">
          <EmptyState
            icon={<ShieldCheck size={20} aria-hidden="true" />}
            title={t("admin.responsible.noCases")}
            description={t("admin.responsible.noCasesDescription")}
          />
        </div>
      ) : (
        <AdminTableClient
          basePath="/admin/responsible-gambling"
          rows={rows}
          page={cases.page}
          pageSize={cases.pageSize}
          total={cases.total}
          totalPages={cases.totalPages}
          search={list.search}
          sort={list.sort}
          direction={list.direction}
          columns={[
            { key: "user", header: t("admin.column.name"), sortable: true },
            { key: "kind", header: t("admin.column.kind") },
            { key: "detail", header: t("admin.column.detail"), secondary: true },
            {
              key: "createdAt",
              header: t("admin.column.opened"),
              numeric: true,
              sortable: true,
            },
            { key: "severity", header: t("admin.column.severity"), align: "end" },
          ]}
        />
      )}
    </div>
  );
}

function PolicyTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="text-caption uppercase text-ink-subtle">{label}</p>
      <p className="mt-1.5 text-small leading-relaxed text-ink">{value}</p>
    </div>
  );
}
