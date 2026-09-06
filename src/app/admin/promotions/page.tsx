import type { Metadata } from "next";
import type { PromotionStatus } from "@/types";
import { getAdminPromotions } from "@/services/adminService";
import { getAdminT, getRequestLocale } from "@/i18n/server";
import { formatDate } from "@/lib/format";
import { AdminTableClient, type AdminRow } from "@/components/admin/AdminTableClient";
import { parseListQuery } from "@/lib/listQuery";
import { PromotionFormLauncher } from "@/components/admin/PromotionForm";
import type { BadgeTone } from "@/components/ui/Badge";

export const metadata: Metadata = { title: "Promotions" };

const TONE: Record<PromotionStatus, BadgeTone> = {
  active: "success",
  scheduled: "info",
  expired: "neutral",
  disabled: "warning",
};

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function AdminPromotionsPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const list = parseListQuery(params);

  const [t, locale, promotions] = await Promise.all([
    getAdminT(),
    getRequestLocale(),
    getAdminPromotions(list),
  ]);

  const rows: AdminRow[] = promotions.items.map((promotion) => ({
    id: promotion.id,
    cells: {
      slug: { text: promotion.slug, sub: t(promotion.titleKey) },
      kind: { text: t(`admin.promoKind.${promotion.kind}`) },
      status: {
        text: t(`promotions.status.${promotion.status}`),
        badge: {
          label: t(`promotions.status.${promotion.status}`),
          tone: TONE[promotion.status],
          dot: true,
        },
      },
      starts: { text: formatDate(promotion.startsAt, locale) },
      ends: {
        text: promotion.endsAt
          ? formatDate(promotion.endsAt, locale)
          : t("promotions.noEndDate"),
      },
    },
  }));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-h1 text-ink">{t("admin.promotions.title")}</h1>
          <p className="mt-1 text-small text-ink-muted">
            {t("admin.promotions.description")}
          </p>
        </div>
        <PromotionFormLauncher />
      </header>

      <AdminTableClient
        basePath="/admin/promotions"
        rows={rows}
        page={promotions.page}
        pageSize={promotions.pageSize}
        total={promotions.total}
        totalPages={promotions.totalPages}
        search={list.search}
        searchPlaceholder={t("admin.promotions.searchPlaceholder")}
        sort={list.sort}
        direction={list.direction}
        columns={[
          { key: "slug", header: t("admin.column.promotion"), sortable: true },
          { key: "kind", header: t("admin.column.kind"), secondary: true },
          { key: "status", header: t("admin.column.status") },
          {
            key: "starts",
            header: t("admin.column.starts"),
            numeric: true,
            sortable: true,
            secondary: true,
          },
          { key: "ends", header: t("admin.column.ends"), numeric: true, align: "end" },
        ]}
      />
    </div>
  );
}
