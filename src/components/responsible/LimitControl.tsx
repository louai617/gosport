"use client";

import { useActionState, useState } from "react";
import { Clock, Plus } from "lucide-react";
import type { LimitKind, LimitPeriod, ResponsibleGamblingLimit } from "@/types";
import { updateLimitAction } from "@/app/actions/responsible";
import { emptyLimitState } from "@/lib/actionState";
import { formatAmount, formatDateTime } from "@/lib/format";
import { useI18n } from "@/i18n/I18nProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { ProgressBar } from "@/components/ui/ProgressBar";

export interface LimitControlProps {
  limit: ResponsibleGamblingLimit;
  titleKey: string;
  descriptionKey: string;
  /** Hours an *increase* waits before it applies — set by the operator. */
  coolingOffHours: number;
}

/**
 * One responsible-gambling limit.
 *
 * The asymmetry is the point and is stated on screen: lowering a limit takes
 * effect at once, raising it waits out a cooling-off window. A control that
 * let a player raise their own ceiling mid-session would be worse than no
 * control at all. The server enforces it; this only explains it.
 */
export function LimitControl({
  limit,
  titleKey,
  descriptionKey,
  coolingOffHours,
}: LimitControlProps) {
  const { t, locale } = useI18n();
  const [state, formAction, pending] = useActionState(updateLimitAction, emptyLimitState);
  const [value, setValue] = useState(String(limit.value));

  const usedPercent = limit.value > 0 ? (limit.used / limit.value) * 100 : 0;
  const lowering = Number(value.replace(",", ".")) < limit.value;
  const showUsage = limit.kind !== "single_bet";

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
          {formatAmount(limit.value, locale)}
          {showUsage ? ` · ${t(`responsible.limits.period.${limit.period}`)}` : ""}
        </span>
      </div>

      {showUsage ? (
        <div className="mt-4">
          <ProgressBar
            value={usedPercent}
            tone={usedPercent > 85 ? "warning" : "primary"}
            label={t("responsible.limits.used", {
              used: formatAmount(limit.used, locale),
              limit: formatAmount(limit.value, locale),
            })}
            valueLabel={`${Math.round(usedPercent)}%`}
          />
        </div>
      ) : null}

      {limit.pendingValue !== null && limit.pendingEffectiveFrom ? (
        <Alert tone="info" className="mt-4">
          <span className="flex items-center gap-1.5">
            <Clock size={13} aria-hidden="true" className="shrink-0" />
            {t("responsible.limits.pendingChange", {
              value: formatAmount(limit.pendingValue, locale),
              date: formatDateTime(limit.pendingEffectiveFrom, locale),
            })}
          </span>
        </Alert>
      ) : null}

      {state.messageKey ? (
        <Alert tone={state.ok ? "success" : "danger"} className="mt-4">
          {t(state.messageKey, { hours: coolingOffHours })}
        </Alert>
      ) : null}

      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="kind" value={limit.kind} />
        <input type="hidden" name="period" value={limit.period} />

        <div className="min-w-36 flex-1">
          <label htmlFor={`limit-${limit.id}`} className="mb-1.5 block text-small text-ink-muted">
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
          : t("responsible.limits.increaseDelayed", { hours: coolingOffHours })}
      </p>
    </section>
  );
}

const PERIODS: LimitPeriod[] = ["daily", "weekly", "monthly"];

export interface NewLimitFormProps {
  kind: LimitKind;
  titleKey: string;
  descriptionKey: string;
  /** Periods that already have a limit — those are edited above, not added. */
  takenPeriods: LimitPeriod[];
}

/** Starts a limit that does not exist yet. A first limit is protective, so it applies at once. */
export function NewLimitForm({ kind, titleKey, descriptionKey, takenPeriods }: NewLimitFormProps) {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState(updateLimitAction, emptyLimitState);

  const free = PERIODS.filter((period) => !takenPeriods.includes(period));
  // A single-bet cap has no window; it is stored once, as "daily".
  const periods = kind === "single_bet" ? (takenPeriods.length ? [] : (["daily"] as LimitPeriod[])) : free;
  if (periods.length === 0) return null;

  return (
    <section className="rounded-xl border border-dashed border-line bg-surface/60 p-4">
      <h3 className="flex items-center gap-2 text-h3 text-ink">
        <Plus size={15} aria-hidden="true" className="text-ink-subtle" />
        {t(titleKey)}
      </h3>
      <p className="mt-1 max-w-prose text-small leading-relaxed text-ink-muted">
        {t(descriptionKey)}
      </p>

      {state.messageKey ? (
        <Alert tone={state.ok ? "success" : "danger"} className="mt-4">
          {t(state.messageKey)}
        </Alert>
      ) : null}

      <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
        <input type="hidden" name="kind" value={kind} />

        {kind === "single_bet" ? (
          <input type="hidden" name="period" value="daily" />
        ) : (
          <div className="w-40">
            <Select
              name="period"
              label={t("responsible.limits.periodLabel")}
              defaultValue={periods[0]}
              options={periods.map((period) => ({
                value: period,
                label: t(`responsible.limits.period.${period}`),
              }))}
            />
          </div>
        )}

        <div className="min-w-36 flex-1">
          <label htmlFor={`new-${kind}`} className="mb-1.5 block text-small text-ink-muted">
            {t("responsible.limits.amountLabel")}
          </label>
          <input
            id={`new-${kind}`}
            name="value"
            inputMode="decimal"
            placeholder="100"
            className="numeric h-[38px] w-full rounded-md border border-line bg-surface-2 px-3 text-small font-semibold text-ink transition-colors duration-fast hover:border-line-strong focus:border-primary"
          />
        </div>

        <Button type="submit" variant="secondary" loading={pending}>
          {t("responsible.limits.setLimit")}
        </Button>
      </form>
    </section>
  );
}
