import type { Metadata } from "next";
import { getAdminCompetitions } from "@/services/adminService";
import { getCountries, getSports } from "@/services/sportsService";
import { getAdminT } from "@/i18n/server";
import { AdminTableClient, type AdminRow } from "@/components/admin/AdminTableClient";
import { parseListQuery } from "@/lib/listQuery";

export const metadata: Metadata = { title: "Competitions" };

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function AdminCompetitionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const list = parseListQuery(params);

  const [t, sports, countries, competitions] = await Promise.all([
    getAdminT(),
    getSports(),
    getCountries(),
    getAdminCompetitions(list),
  ]);

  const sportName = (id: string) => {
    const sport = sports.find((entry) => entry.id === id);
    return sport ? t(sport.nameKey) : "—";
  };

  const countryName = (id: string) => {
    const country = countries.find((entry) => entry.id === id);
    return country ? t(country.nameKey) : "—";
  };

  const rows: AdminRow[] = competitions.items.map((competition) => ({
    id: competition.id,
    cells: {
      name: { text: competition.name, sub: competition.shortName },
      sport: { text: sportName(competition.sportId) },
      country: { text: countryName(competition.countryId) },
      events: { text: String(competition.eventCount) },
      live: { text: String(competition.liveEventCount) },
      popular: {
        text: competition.popular ? t("ui.yes") : t("ui.no"),
        badge: competition.popular
          ? { label: t("nav.popular"), tone: "primary" as const }
          : undefined,
      },
    },
  }));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-h1 text-ink">{t("admin.competitions.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">
          {t("admin.competitions.description")}
        </p>
      </header>

      <AdminTableClient
        basePath="/admin/competitions"
        rows={rows}
        page={competitions.page}
        pageSize={competitions.pageSize}
        total={competitions.total}
        totalPages={competitions.totalPages}
        search={list.search}
        searchPlaceholder={t("admin.competitions.searchPlaceholder")}
        sort={list.sort}
        direction={list.direction}
        columns={[
          { key: "name", header: t("admin.column.competition"), sortable: true },
          { key: "sport", header: t("admin.column.sport") },
          { key: "country", header: t("auth.field.country"), secondary: true },
          {
            key: "events",
            header: t("admin.column.events"),
            numeric: true,
            align: "end",
            sortable: true,
          },
          {
            key: "live",
            header: t("live.badge"),
            numeric: true,
            align: "end",
            secondary: true,
          },
          { key: "popular", header: t("nav.popular"), align: "end" },
        ]}
      />
    </div>
  );
}
