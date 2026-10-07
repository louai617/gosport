"use client";

import * as Icons from "lucide-react";
import type { PaymentMethod } from "@/types";
import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/format";
import { useI18n } from "@/i18n/I18nProvider";
import { Badge } from "@/components/ui/Badge";

export interface PaymentMethodCardProps {
  method: PaymentMethod;
  selected?: boolean;
  onSelect?: (id: string) => void;
  name?: string;
}

/** Lucide exports PascalCase; the data carries kebab-case icon names. */
function resolveIcon(name: string) {
  const pascal = name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  const icons = Icons as unknown as Record<string, Icons.LucideIcon | undefined>;
  return icons[pascal] ?? Icons.CreditCard;
}

/**
 * A payment method as a radio option.
 *
 * Every method in this build is `coming_soon` or `unavailable` and none can be
 * selected into a working flow — the disabled state is the honest one, and it
 * is what the card shows.
 */
export function PaymentMethodCard({
  method,
  selected = false,
  onSelect,
  name = "methodId",
}: PaymentMethodCardProps) {
  const { t, locale } = useI18n();
  const Icon = resolveIcon(method.icon);
  const disabled = method.status !== "available";

  return (
    <label
      className={cn(
        "flex cursor-pointer gap-3 rounded-lg border p-3.5 transition-colors duration-fast",
        selected
          ? "border-primary bg-primary-soft/40"
          : "border-line bg-surface hover:border-line-strong",
        disabled && "cursor-not-allowed opacity-70 hover:border-line",
      )}
    >
      <input
        type="radio"
        name={name}
        value={method.id}
        checked={selected}
        disabled={disabled}
        onChange={() => onSelect?.(method.id)}
        className="sr-only"
      />

      <span
        aria-hidden="true"
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-lg border",
          selected
            ? "border-primary/40 bg-primary-soft text-primary"
            : "border-line-soft bg-surface-2 text-ink-subtle",
        )}
      >
        <Icon size={18} />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-small font-semibold text-ink">{t(method.nameKey)}</span>
          {method.status === "coming_soon" ? (
            <Badge tone="info">{t("ui.comingSoon")}</Badge>
          ) : method.status === "unavailable" ? (
            <Badge tone="neutral">{t("ui.unavailable")}</Badge>
          ) : null}
        </span>

        <span className="mt-0.5 block text-caption normal-case leading-relaxed tracking-normal text-ink-muted">
          {t(method.descriptionKey)}
        </span>

        <span className="numeric mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-caption normal-case tracking-normal text-ink-subtle">
          {/* Operator payouts are bounded by the operator's own settings, not a rail's. */}
          {method.kind === "manual" ? null : (
            <span>
              {t("wallet.limits", {
                min: formatAmount(method.minAmount, locale),
                max: formatAmount(method.maxAmount, locale),
              })}
            </span>
          )}
          <span>{t(method.processingTimeKey)}</span>
          {method.requiresKyc ? <span>{t("wallet.requiresKyc")}</span> : null}
        </span>
      </span>
    </label>
  );
}
