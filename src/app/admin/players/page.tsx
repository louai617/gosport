import type { Metadata } from "next";
import { flattenParams, playerListQuery } from "@/lib/adminQueries";
import { getAdminT } from "@/i18n/server";
import { can } from "@/server/auth/permissions";
import { requirePageAdmin } from "@/server/auth/pageGuard";
import { listPlayers } from "@/services/playerAdminService";
import { PlayersTable } from "@/components/admin/PlayersTable";

export const metadata: Metadata = { title: "Players" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminPlayersPage({ searchParams }: PageProps) {
  const user = await requirePageAdmin("players.read");
  const raw = flattenParams(await searchParams);
  const parsed = playerListQuery.safeParse(raw);
  const query = parsed.success ? parsed.data : playerListQuery.parse({});

  const [t, players] = await Promise.all([getAdminT(), listPlayers(query)]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-h1 text-ink">{t("admin.players.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">{t("admin.players.description")}</p>
      </header>

      <PlayersTable
        data={players}
        canCreate={can(user.role, "players.create")}
        params={{
          search: raw.search,
          status: raw.status,
          kycStatus: raw.kycStatus,
          restricted: raw.restricted,
          from: raw.from,
          to: raw.to,
          sort: raw.sort,
          direction: raw.direction === "asc" ? "asc" : raw.direction === "desc" ? "desc" : undefined,
        }}
      />
    </div>
  );
}
