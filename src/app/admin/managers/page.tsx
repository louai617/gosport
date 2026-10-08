import type { Metadata } from "next";
import { flattenParams } from "@/lib/adminQueries";
import { getAdminT } from "@/i18n/server";
import { requirePageAdmin } from "@/server/auth/pageGuard";
import { listManagers } from "@/services/managerService";
import { ManagersTable } from "@/components/admin/ManagersTable";

export const metadata: Metadata = { title: "Managers" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminManagersPage({ searchParams }: PageProps) {
  await requirePageAdmin("managers.read");
  const raw = flattenParams(await searchParams);
  const page = Number(raw.page) || 1;

  const [t, managers] = await Promise.all([
    getAdminT(),
    listManagers({ search: raw.search, page }),
  ]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-h1 text-ink">{t("admin.managers.title")}</h1>
        <p className="mt-1 text-small text-ink-muted">{t("admin.managers.description")}</p>
      </header>
      <ManagersTable data={managers} params={{ search: raw.search }} />
    </div>
  );
}
