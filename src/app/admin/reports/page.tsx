import type { Metadata } from "next";
import { getAdminStats } from "@/services/adminService";
import { getSports } from "@/services/sportsService";
import { getAdminT, getRequestLocale } from "@/i18n/server";
import { formatAmount } from "@/lib/format";
import { Alert } from "@/components/ui/Alert";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatTile } from "@/components/account/StatTile";

export const metadata: Metadata = { title: "Reports" };

export default async function AdminReportsPage() {
  const [t, locale, stats, sports] = await Promise.all([
    getAdminT(),
    getRequestLocale(),
    getAdminStats(),
    getSports(),
  ]);

  const totalEvents = sports.reduce((sum, sport) => sum + sport.eventCount, 0) || 1;
  const bySport = [...sports]
    .sort((a, b) => b.eventCount - a.eventCount)
    .filter((sport) => sport.eventCount > 0);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-h1 text-ink">{t("admin.reports.title")}</h1>
        <p className="mt-1 max-w-prose text-small text-ink-muted">
          {t("admin.reports.description")}
        </p>
      </header>

      <Alert tone="warning" title={t("common.demo.badge")}>
        {t("admin.reports.demoNotice")}
      </Alert>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label={t("admin.stat.totalStake")}
          value={formatAmount(stats.totalStakeSimulated, locale)}
          hint={t("admin.stat.totalStakeHint")}
        />
        <StatTile
          label={t("admin.stat.openBets")}
          value={String(stats.openBets)}
          tone="primary"
        />
        <StatTile
          label={t("admin.stat.registeredUsers")}
          value={String(stats.registeredUsers)}
        />
      </div>

      <section
        aria-labelledby="by-sport"
        className="rounded-xl border border-line bg-surface p-5"
      >
        <h2 id="by-sport" className="text-h2 text-ink">
          {t("admin.reports.bySport")}
        </h2>
        <p className="mt-1 text-small text-ink-muted">
          {t("admin.reports.bySportDescription")}
        </p>

        <div className="mt-5 space-y-4">
          {bySport.map((sport) => (
            <ProgressBar
              key={sport.id}
              value={(sport.eventCount / totalEvents) * 100}
              label={t(sport.nameKey)}
              valueLabel={String(sport.eventCount)}
              tone={sport.liveEventCount > 0 ? "live" : "primary"}
            />
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-h2 text-ink">{t("admin.reports.regulatory")}</h2>
        <p className="mt-1 max-w-prose text-small leading-relaxed text-ink-muted">
          {t("admin.reports.regulatoryBody")}
        </p>
      </section>
    </div>
  );
}
