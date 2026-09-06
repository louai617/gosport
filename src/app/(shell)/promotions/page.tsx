import type { Metadata } from "next";
import { Gift } from "lucide-react";
import { getPromotions } from "@/services/promotionsService";
import { getT } from "@/i18n/server";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { PromotionCard } from "@/components/promotions/PromotionCard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("promotions.title") };
}

export default async function PromotionsPage() {
  const [t, promotions] = await Promise.all([getT(), getPromotions({})]);

  const active = promotions.filter((promotion) => promotion.status === "active");
  const other = promotions.filter((promotion) => promotion.status !== "active");

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8">
      <header className="max-w-3xl">
        <h1 className="text-display text-ink">{t("promotions.title")}</h1>
        <p className="mt-2 text-body leading-relaxed text-ink-muted">
          {t("promotions.subtitle")}
        </p>
      </header>

      <Alert tone="warning" className="mt-6 max-w-3xl" title={t("common.demo.badge")}>
        {t("promotions.demoNotice")}
      </Alert>

      {promotions.length === 0 ? (
        <div className="mt-8 rounded-xl border border-line bg-surface">
          <EmptyState
            icon={<Gift size={20} aria-hidden="true" />}
            title={t("empty.noPromotions")}
          />
        </div>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((promotion) => (
              <PromotionCard key={promotion.id} promotion={promotion} />
            ))}
          </div>

          {other.length > 0 ? (
            <section className="mt-10">
              <h2 className="mb-4 text-h2 text-ink">{t("promotions.status.expired")}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {other.map((promotion) => (
                  <PromotionCard key={promotion.id} promotion={promotion} />
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
