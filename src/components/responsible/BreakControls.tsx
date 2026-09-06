"use client";

import { useActionState, useState } from "react";
import { CalendarOff, Pause } from "lucide-react";
import { RESPONSIBLE_GAMBLING } from "@/config/app.config";
import {
  coolingOffAction,
  emptyLimitState,
  selfExclusionAction,
} from "@/app/actions/responsible";
import { cn } from "@/lib/cn";
import { useT } from "@/i18n/I18nProvider";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";

/**
 * Taking a break, and stopping.
 *
 * Self-exclusion carries an explicit acknowledgement because it cannot be
 * lifted early — a player must not be able to trigger it by mis-tapping, and
 * must not be able to undo it in a weak moment either.
 */
export function BreakControls() {
  const t = useT();

  const [coolingState, coolingAction, coolingPending] = useActionState(
    coolingOffAction,
    emptyLimitState,
  );
  const [exclusionState, exclusionFormAction, exclusionPending] = useActionState(
    selfExclusionAction,
    emptyLimitState,
  );

  const [days, setDays] = useState<number>(RESPONSIBLE_GAMBLING.coolingOffOptionsDays[0]);
  const [duration, setDuration] = useState<string>(
    String(RESPONSIBLE_GAMBLING.selfExclusionOptionsMonths[0]),
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-xl border border-line bg-surface p-4">
        <h3 className="flex items-center gap-2 text-h3 text-ink">
          <Pause size={16} aria-hidden="true" className="text-ink-subtle" />
          {t("responsible.cooling.title")}
        </h3>
        <p className="mt-1.5 text-small leading-relaxed text-ink-muted">
          {t("responsible.cooling.body")}
        </p>

        {coolingState.messageKey ? (
          <Alert tone={coolingState.ok ? "success" : "danger"} className="mt-4">
            {t(coolingState.messageKey)}
          </Alert>
        ) : null}

        <form action={coolingAction} className="mt-4 space-y-3">
          <input type="hidden" name="days" value={days} />

          <fieldset>
            <legend className="mb-2 text-small text-ink-muted">
              {t("responsible.cooling.title")}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {RESPONSIBLE_GAMBLING.coolingOffOptionsDays.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDays(option)}
                  aria-pressed={days === option}
                  className={cn(
                    "numeric h-9 cursor-pointer rounded-md border px-3 text-small font-semibold transition-colors duration-fast",
                    days === option
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-line bg-surface-2 text-ink-muted hover:border-line-strong hover:text-ink",
                  )}
                >
                  {option === 1
                    ? t("responsible.cooling.day", { count: option })
                    : t("responsible.cooling.days", { count: option })}
                </button>
              ))}
            </div>
          </fieldset>

          <Button type="submit" variant="secondary" loading={coolingPending}>
            {t("responsible.cooling.confirm")}
          </Button>
        </form>
      </section>

      <section className="rounded-xl border border-danger/25 bg-danger-soft/25 p-4">
        <h3 className="flex items-center gap-2 text-h3 text-ink">
          <CalendarOff size={16} aria-hidden="true" className="text-danger" />
          {t("responsible.selfExclusion.title")}
        </h3>
        <p className="mt-1.5 text-small leading-relaxed text-ink-muted">
          {t("responsible.selfExclusion.body")}
        </p>

        <Alert tone="danger" className="mt-4">
          {t("responsible.selfExclusion.warning")}
        </Alert>

        {exclusionState.messageKey ? (
          <Alert tone={exclusionState.ok ? "success" : "danger"} className="mt-3">
            {t(exclusionState.messageKey)}
          </Alert>
        ) : null}

        <form action={exclusionFormAction} className="mt-4 space-y-3">
          <input type="hidden" name="duration" value={duration} />

          <fieldset>
            <legend className="mb-2 text-small text-ink-muted">
              {t("responsible.selfExclusion.title")}
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {RESPONSIBLE_GAMBLING.selfExclusionOptionsMonths.map((months) => (
                <DurationButton
                  key={months}
                  active={duration === String(months)}
                  onClick={() => setDuration(String(months))}
                  label={t("responsible.selfExclusion.months", { count: months })}
                />
              ))}
              <DurationButton
                active={duration === "permanent"}
                onClick={() => setDuration("permanent")}
                label={t("responsible.selfExclusion.permanent")}
              />
            </div>
          </fieldset>

          <Checkbox
            name="acknowledged"
            required
            label={t("responsible.selfExclusion.acknowledge")}
            error={exclusionState.fieldError ? t(exclusionState.fieldError) : undefined}
          />

          <Button type="submit" variant="danger" loading={exclusionPending}>
            {t("responsible.selfExclusion.confirm")}
          </Button>
        </form>
      </section>
    </div>
  );
}

function DurationButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-9 cursor-pointer rounded-md border px-3 text-small font-semibold transition-colors duration-fast",
        active
          ? "border-danger bg-danger-soft text-danger"
          : "border-line bg-surface-2 text-ink-muted hover:border-line-strong hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}
