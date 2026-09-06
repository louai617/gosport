import type { Metadata } from "next";
import { getSports } from "@/services/sportsService";
import { getAdminT } from "@/i18n/server";
import { SportIcon } from "@/components/sports/SportIcon";
import { StatusDot } from "@/components/ui/StatusDot";
import { TBody, TD, TH, THead, TR, Table } from "@/components/ui/Table";

export const metadata: Metadata = { title: "Sports" };

export default async function AdminSportsPage() {
  const [t, sports] = await Promise.all([getAdminT(), getSports()]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-h1 text-ink">{t("admin.sports.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">{t("admin.sports.description")}</p>
      </header>

      <div className="overflow-hidden rounded-xl border border-line bg-surface">
        <Table>
          <THead>
            <tr>
              <TH>{t("admin.column.sport")}</TH>
              <TH>{t("admin.column.key")}</TH>
              <TH align="end">{t("admin.column.order")}</TH>
              <TH align="end">{t("admin.column.events")}</TH>
              <TH align="end">{t("live.badge")}</TH>
            </tr>
          </THead>
          <TBody>
            {sports.map((sport) => (
              <TR key={sport.id}>
                <TD>
                  <span className="flex items-center gap-2.5">
                    <SportIcon name={sport.icon} size={18} className="text-ink-subtle" />
                    <span className="font-medium text-ink">{t(sport.nameKey)}</span>
                  </span>
                </TD>
                <TD numeric className="text-ink-muted">
                  {sport.key}
                </TD>
                <TD align="end" numeric>
                  {sport.order}
                </TD>
                <TD align="end" numeric>
                  {sport.eventCount}
                </TD>
                <TD align="end">
                  {sport.liveEventCount > 0 ? (
                    <span className="inline-flex items-center gap-1.5">
                      <StatusDot tone="live" pulse size="xs" />
                      <span className="numeric font-semibold text-live">
                        {sport.liveEventCount}
                      </span>
                    </span>
                  ) : (
                    <span className="numeric text-ink-subtle">0</span>
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
