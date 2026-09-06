"use client";

import { useActionState, useState } from "react";
import { Clock } from "lucide-react";
import { RESPONSIBLE_GAMBLING } from "@/config/app.config";
import type { ResponsibleGamblingLimit } from "@/types";
import { emptyLimitState, updateLimitAction } from "@/app/actions/responsible";
import { formatAmount, formatDateTime, formatNumber } from "@/lib/format";
import { useI18n } from "@/i18n/I18nProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";

export interface LimitControlProps {
  limit: ResponsibleGamblingLimit;
  titleKey: string;
  descriptionKey: string;
}

const KIND_LABEL: Record<string, string> = {
  deposit: "responsible.limits.deposit.title",
  stake: "responsible.limits.stake.title",
  loss: "responsible.limits.loss.title",
  session_duration: "responsible.limits.session.title",
  single_bet: "responsible.limits.singleBet.title",
};

/**
 * One responsible-gambling limit.
 *
 * The asymmetry is the point and is stated on screen: lowering a limit takes
 * effect at once, raising it waits out a cooling-off window. A control that
 * let a player raise their own ceiling mid-session would be worse than no
 * control at all.
 */
export function LimitControl({ limit, titleKey, descriptionKey }: LimitControlProps) {
  const { t, locale } = useI18n();
  const [state, formAction, pending] = useActionState(updateLimitAction, emptyLimitState);
  const [value, setValue] = useState(String(limit.value));

  const isDuration = limit.kind === "session_duration";
  const format = (amount: number) =>
    isDuration
      ? t("responsible.limits.minutes", { count: formatNumber(amount, locale) })
      : formatAmount(amount, locale);

  const usedPercent = limit.value > 0 ? (limit.used / limit.value) * 100 : 0;
  const lowering = Number(value) < limit.value;

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-h3 text-ink">{t(titleKey)}</h3>
          <p className="mt-1 max-w-prose text-small leading-relaxed text-ink-muted">
            {t(descriptionKey)}
          </p>
        </div>
        <span className="numeric shrink-0 rounded-md border border-line bg-surface-2 px-2.5 py-1 text-small font-semibold text-ink">
          {format(limit.value)} · {t(`responsible.limits.period.${limit.period}`)}
        </span>
      </div>

      <div className="mt-4">
        <ProgressBar
          value={usedPercent}
          tone={usedPercent > 85 ? "warning" : "primary"}
          label={t("responsible.limits.used", {
            used: format(limit.used),
            limit: format(limit.value),
          })}
          valueLabel={`${Math.round(usedPercent)}%`}
        />
      </div>

      {limit.pendingValue !== null && limit.pendingEffectiveFrom ? (
        <Alert tone="info" className="mt-4">
          <span className="flex items-center gap-1.5">
            <Clock size={13} aria-hidden="true" className="shrink-0" />
            {t("responsible.limits.pendingChange", {
              value: format(limit.pendingValue),
              date: formatDateTime(limit.pendingEffectiveFrom, locale),
            })}
          </span>
        </Alert>
      ) : null}

      {state.messageKey ? (
        <Alert tone={state.ok ? "success" : "danger"} className="mt-4">
          {t(state.messageKey)}
        </Alert>
      ) : null}

      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="kind" value={limit.kind} />
        <input type="hidden" name="period" value={limit.period} />

        <div className="min-w-36 flex-1">
          <label
            htmlFor={`limit-${limit.id}`}
            className="mb-1.5 block text-small text-ink-muted"
          >
            {t("responsible.limits.currentValue")}
          </label>
          <input
            id={`limit-${limit.id}`}
            name="value"
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="numeric h-[38px] w-full rounded-md border border-line bg-surface-2 px-3 text-small font-semibold text-ink transition-colors duration-fast hover:border-line-strong focus:border-primary"
          />
        </div>

        <Button type="submit" variant="secondary" loading={pending}>
          {t("responsible.limits.setLimit")}
        </Button>
      </form>

      <p className="mt-2.5 text-caption normal-case leading-relaxed tracking-normal text-ink-subtle">
        {lowering
          ? t("responsible.limits.decreaseImmediate")
          : t("responsible.limits.increaseDelayed", {
              hours: RESPONSIBLE_GAMBLING.limitIncreaseCoolingOffHours,
            })}
      </p>

      <span className="sr-only">{t(KIND_LABEL[limit.kind] ?? titleKey)}</span>
    </section>
  );
}
