import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { CircleCheck, FileText } from "lucide-react";
import { getPromotionBySlug } from "@/services/promotionsService";
import { getRequestLocale, getT } from "@/i18n/server";
import { formatDate } from "@/lib/format";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { buttonStyles } from "@/components/ui/Button";
import { SimulatedBadge } from "@/components/ui/SimulatedBadge";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const promotion = await getPromotionBySlug(slug);
  if (!promotion) return {};

  const t = await getT();
  return { title: t(promotion.titleKey) };
}

export default async function PromotionPage({ params }: PageProps) {
  const { slug } = await params;
  const promotion = await getPromotionBySlug(slug);
  if (!promotion) notFound();

  const [t, locale] = await Promise.all([getT(), getRequestLocale()]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div
        aria-hidden="true"
        className="h-32 rounded-2xl border border-line"
        style={{
          backgroundImage: `radial-gradient(120% 160% at 12% 0%, oklch(0.46 0.14 ${promotion.hue} / 0.55) 0%, transparent 62%), linear-gradient(135deg, oklch(0.28 0.08 ${promotion.hue}), oklch(0.19 0.04 ${promotion.hue}))`,
        }}
      />

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Badge tone={promotion.status === "active" ? "success" : "neutral"}>
          {t(`promotions.status.${promotion.status}`)}
        </Badge>
        <SimulatedBadge />
        <span className="numeric text-caption normal-case tracking-normal text-ink-subtle">
          {promotion.endsAt
            ? t("promotions.validUntil", { date: formatDate(promotion.endsAt, locale) })
            : t("promotions.noEndDate")}
        </span>
      </div>

      <h1 className="mt-3 text-display text-ink">{t(promotion.titleKey)}</h1>
      <p className="mt-3 text-body leading-relaxed text-ink-muted">
        {t(promotion.descriptionKey)}
      </p>

      <Alert tone="warning" className="mt-6" title={t("common.demo.badge")}>
        {t("promotions.demoNotice")}
      </Alert>

      <section aria-labelledby="eligibility" className="mt-8">
        <h2 id="eligibility" className="text-h2 text-ink">
          {t("promotions.eligibility")}
        </h2>
        <ul className="mt-3 space-y-2">
          {promotion.eligibilityKeys.map((key) => (
            <li key={key} className="flex items-start gap-2.5">
              <CircleCheck
                size={15}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-success"
              />
              <span className="text-small leading-relaxed text-ink-muted">{t(key)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="terms" className="mt-8">
        <h2 id="terms" className="text-h2 text-ink">
          {t("promotions.terms")}
        </h2>
        <ul className="mt-3 space-y-2">
          {promotion.termsKeys.map((key) => (
            <li key={key} className="flex items-start gap-2.5">
              <FileText
                size={15}
                aria-hidden="true"
                className="mt-0.5 shrink-0 text-ink-subtle"
              />
              <span className="text-small leading-relaxed text-ink-muted">{t(key)}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Link href={promotion.ctaHref} className={buttonStyles({ size: "lg" })}>
          {t(promotion.ctaLabelKey)}
        </Link>
        <Link
          href="/responsible-gambling"
          className={buttonStyles({ variant: "ghost", size: "lg" })}
        >
          {t("footer.responsibleGambling")}
        </Link>
      </div>

      <p className="mt-8 text-caption normal-case leading-relaxed tracking-normal text-ink-subtle">
        {t("common.legal.ageWarning")}
      </p>
    </div>
  );
}
