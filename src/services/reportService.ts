import "server-only";

import type { PeriodQuery } from "@/lib/adminValidation";
import { fromBig } from "@/lib/money";
import { toCsv } from "@/lib/csv";
import { prisma } from "@/server/db";
import { requirePermission } from "@/server/auth/guard";
import { audit } from "@/server/security/audit";
import { getDashboard, periodFromQuery } from "./analyticsService";

/**
 * Reports and CSV export.
 *
 * Exports carry the least that is useful: usernames and ids, never e-mail
 * addresses, phone numbers, IP addresses or internal reasons. Every export is
 * itself an audited event.
 */

export type ReportKind = "summary" | "transactions" | "players";

export const REPORT_KINDS: readonly ReportKind[] = ["summary", "transactions", "players"];

const EXPORT_ROW_LIMIT = 50_000;

export interface ExportResult {
  filename: string;
  csv: string;
  rows: number;
  truncated: boolean;
}

export async function exportReport(
  kind: ReportKind,
  query: Partial<PeriodQuery>,
): Promise<ExportResult> {
  const actor = await requirePermission("reports.export");
  const period = periodFromQuery(query);
  const stamp = `${period.fromDay}_${period.toDay}`;

  let csv: string;
  let rows: number;
  let truncated = false;

  if (kind === "summary") {
    const data = await getDashboard(query);
    const lines = data.series.starts.map((start, i) => [
      start,
      data.series.registrations[i] ?? 0,
      (data.series.deposits[i] ?? 0).toFixed(3),
      (data.series.withdrawals[i] ?? 0).toFixed(3),
      (data.series.stakes[i] ?? 0).toFixed(3),
      (data.series.payouts[i] ?? 0).toFixed(3),
      ((data.series.stakes[i] ?? 0) - (data.series.payouts[i] ?? 0)).toFixed(3),
    ]);
    rows = lines.length;
    truncated = data.truncated;
    csv = toCsv(
      [
        "bucket_start_utc",
        "new_players_count",
        "deposits_gross_tnd",
        "withdrawals_gross_tnd",
        "stakes_gross_tnd",
        "payouts_gross_tnd",
        "ggr_net_tnd",
      ],
      lines,
    );
  } else if (kind === "transactions") {
    const found = await prisma.transaction.findMany({
      where: { createdAt: { gte: period.from, lt: period.to } },
      include: { user: { select: { username: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: EXPORT_ROW_LIMIT + 1,
    });
    truncated = found.length > EXPORT_ROW_LIMIT;
    const slice = found.slice(0, EXPORT_ROW_LIMIT);
    rows = slice.length;
    csv = toCsv(
      ["reference", "created_at_utc", "username", "type", "status", "amount_tnd", "balance_after_tnd"],
      slice.map((row) => [
        row.reference,
        row.createdAt.toISOString(),
        row.user.username,
        row.type,
        row.status,
        (fromBig(row.amount) / 1000).toFixed(3),
        (fromBig(row.balanceAfter) / 1000).toFixed(3),
      ]),
    );
  } else {
    const found = await prisma.user.findMany({
      where: { role: "PLAYER", createdAt: { gte: period.from, lt: period.to } },
      include: { profile: { select: { countryCode: true, kycStatus: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: EXPORT_ROW_LIMIT + 1,
    });
    truncated = found.length > EXPORT_ROW_LIMIT;
    const slice = found.slice(0, EXPORT_ROW_LIMIT);
    rows = slice.length;
    csv = toCsv(
      ["player_id", "username", "registered_at_utc", "status", "country", "verification"],
      slice.map((row) => [
        row.id,
        row.username,
        row.createdAt.toISOString(),
        row.status,
        row.profile?.countryCode ?? "",
        row.profile?.kycStatus ?? "",
      ]),
    );
  }

  await audit({
    action: "admin.report.exported",
    actor,
    description: `Exported ${kind} report ${period.fromDay} → ${period.toDay} (${rows} rows)`,
    metadata: { kind, from: period.fromDay, to: period.toDay, rows, truncated },
  });

  return { filename: `sportgo-${kind}-${stamp}.csv`, csv, rows, truncated };
}
