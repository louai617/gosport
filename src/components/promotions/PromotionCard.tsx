"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Promotion } from "@/types";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { Badge } from "@/components/ui/Badge";
import { SimulatedBadge } from "@/components/ui/SimulatedBadge";

export interface PromotionCardProps {
  promotion: Promotion;
  variant?: "default" | "compact";
  className?: string;
}

const STATUS_TONE = {
  active: "success",
  scheduled: "info",
  expired: "neutral",
  disabled: "neutral",
} as const;

/**
 * Artwork is generated from the promotion's own hue rather than shipping an
 * image per offer: it keeps the page light, and it means a new promotion needs
 * no design round trip.
 */
export function PromotionCard({
  promotion,
  variant = "default",
  className,
}: PromotionCardProps) {
  const t = useT();

  return (
    <article
      className={cn(
        "group flex flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-e2 transition-[border-color,transform] duration-base hover:-translate-y-px hover:border-line-strong edge-light",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className={cn("relative shrink-0", variant === "compact" ? "h-16" : "h-24")}
        style={{
          backgroundImage: `radial-gradient(120% 160% at 12% 0%, oklch(0.46 0.14 ${promotion.hue} / 0.55) 0%, transparent 62%), linear-gradient(135deg, oklch(0.28 0.08 ${promotion.hue}), oklch(0.19 0.04 ${promotion.hue}))`,
        }}
      >
        <span className="absolute inset-x-0 bottom-0 h-px bg-line" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[promotion.status]}>
            {t(`promotions.status.${promotion.status}`)}
          </Badge>
          <SimulatedBadge />
        </div>

        <h3 className="text-h3 text-ink">{t(promotion.titleKey)}</h3>

        <p className="mt-1.5 line-clamp-3 flex-1 text-small leading-relaxed text-ink-muted">
          {t(promotion.summaryKey)}
        </p>

        <Link
          href={`/promotions/${promotion.slug}`}
          className="mt-4 inline-flex items-center gap-1.5 self-start text-small font-semibold text-primary transition-colors duration-fast hover:text-primary-hover"
        >
          {t(promotion.ctaLabelKey)}
          <ArrowRight
            size={14}
            aria-hidden="true"
            className="flip-rtl transition-transform duration-base group-hover:translate-x-0.5"
          />
        </Link>
      </div>
    </article>
  );
}
