import type { Metadata } from "next";
import type { EventStatus } from "@/types";
import { getAdminEvents } from "@/services/adminService";
import { getSports } from "@/services/sportsService";
import { getAdminT, getRequestLocale } from "@/i18n/server";
import { formatDateTime } from "@/lib/format";
import { AdminTableClient, type AdminRow } from "@/components/admin/AdminTableClient";
import { parseListQuery } from "@/lib/listQuery";
import { EventFormLauncher } from "@/components/admin/EventForm";
import type { BadgeTone } from "@/components/ui/Badge";

export const metadata: Metadata = { title: "Events" };

const STATUS_TONE: Record<EventStatus, BadgeTone> = {
  scheduled: "neutral",
  live: "live",
  finished: "success",
  cancelled: "danger",
  postponed: "warning",
};

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function AdminEventsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const list = parseListQuery(params);

  const [t, locale, sports, events] = await Promise.all([
    getAdminT(),
    getRequestLocale(),
    getSports(),
    getAdminEvents({
      ...list,
      sportId: params.sportId,
      status: params.status as EventStatus | undefined,
    }),
  ]);

  const rows: AdminRow[] = events.items.map((event) => ({
    id: event.id,
    cells: {
      fixture: {
        text: `${event.homeTeam.shortName} — ${event.awayTeam.shortName}`,
        sub: event.competition.name,
      },
      sport: { text: t(event.sport.nameKey) },
      startTime: { text: formatDateTime(event.startTime, locale) },
      status: {
        text: t(`status.${event.status}`),
        badge: {
          label: t(`status.${event.status}`),
          tone: STATUS_TONE[event.status],
          dot: true,
        },
      },
      markets: { text: String(event.marketCount) },
    },
  }));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 text-ink">{t("admin.events.title")}</h1>
          <p className="mt-1 text-small text-ink-muted">{t("admin.events.description")}</p>
        </div>
        <EventFormLauncher
          sports={sports.map((sport) => ({ id: sport.id, label: t(sport.nameKey) }))}
        />
      </header>

      <AdminTableClient
        basePath="/admin/events"
        rows={rows}
        page={events.page}
        pageSize={events.pageSize}
        total={events.total}
        totalPages={events.totalPages}
        search={list.search}
        searchPlaceholder={t("admin.events.searchPlaceholder")}
        sort={list.sort}
        direction={list.direction}
        columns={[
          { key: "fixture", header: t("admin.column.fixture"), sortable: true },
          { key: "sport", header: t("admin.column.sport"), secondary: true },
          {
            key: "startTime",
            header: t("admin.column.startTime"),
            numeric: true,
            sortable: true,
          },
          { key: "status", header: t("admin.column.status") },
          {
            key: "markets",
            header: t("admin.column.markets"),
            numeric: true,
            align: "end",
            secondary: true,
          },
        ]}
        filters={[
          {
            param: "sportId",
            label: t("admin.column.sport"),
            value: params.sportId,
            options: sports.map((sport) => ({
              value: sport.id,
              label: t(sport.nameKey),
            })),
          },
          {
            param: "status",
            label: t("admin.column.status"),
            value: params.status,
            options: (
              ["scheduled", "live", "finished", "cancelled", "postponed"] as const
            ).map((value) => ({ value, label: t(`status.${value}`) })),
          },
        ]}
      />
    </div>
  );
}
