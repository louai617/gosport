import type { Metadata } from "next";
import { betListQuery, flattenParams } from "@/lib/adminQueries";
import { getAdminT } from "@/i18n/server";
import { requirePageAdmin } from "@/server/auth/pageGuard";
import { can } from "@/server/auth/permissions";
import { getAdminBets } from "@/services/bettingService";
import { AdminBetsTable } from "@/components/admin/AdminBetsTable";
import { AdminFilters, UrlPagination } from "@/components/admin/AdminFilters";

export const metadata: Metadata = { title: "Bets" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminBetsPage({ searchParams }: PageProps) {
  const user = await requirePageAdmin("bets.read");
  const raw = flattenParams(await searchParams);
  const parsed = betListQuery.safeParse(raw);
  const q = parsed.success ? parsed.data : betListQuery.parse({});

  const [t, bets] = await Promise.all([
    getAdminT(),
    getAdminBets({ ...q, fromIso: q.from?.toISOString(), toIso: q.to?.toISOString() }),
  ]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-h1 text-ink">{t("admin.bets.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">{t("admin.bets.description")}</p>
      </header>

      <AdminFilters
        basePath="/admin/bets"
        searchPlaceholder={t("admin.bets.searchPlaceholder")}
        values={raw}
        selects={[
          {
            param: "kind",
            label: t("admin.column.kind"),
            options: [
              { value: "sports", label: t("admin.bets.sports") },
              { value: "casino", label: t("account.bets.casinoRound") },
            ],
          },
          {
            param: "status",
            label: t("admin.column.status"),
            options: (["pending", "won", "lost", "void"] as const).map((value) => ({
              value,
              label: t(`account.bets.status.${value}`),
            })),
          },
        ]}
        dates
      />

      <AdminBetsTable bets={bets.items} canSettle={can(user.role, "bets.settle")} />
      <UrlPagination basePath="/admin/bets" page={bets.page} pageSize={bets.pageSize} total={bets.total} />
    </div>
  );
}
