import Link from "next/link";
import { Info, Lock } from "lucide-react";
import type { LimitKind, ResponsibleGamblingLimit } from "@/types";
import { getSetting } from "@/server/settings/settingsService";
import { getCurrentUser } from "@/services/userService";
import {
  getResponsibleGamblingLimits,
  getSelfExclusions,
} from "@/services/responsibleService";
import { getRequestLocale, getT } from "@/i18n/server";
import { formatDateTime } from "@/lib/format";
import { Alert } from "@/components/ui/Alert";
import { buttonStyles } from "@/components/ui/Button";
import { BreakControls } from "./BreakControls";
import { LimitControl, NewLimitForm } from "./LimitControl";

/** Whether a break is still running. A function, so the clock is read outside render. */
function isInForce(entry: { endsAt: string | null }): boolean {
  return entry.endsAt === null || Date.parse(entry.endsAt) > Date.now();
}

const KINDS: LimitKind[] = ["deposit", "stake", "loss", "single_bet"];

const COPY: Record<LimitKind, { titleKey: string; descriptionKey: string }> = {
  deposit: { titleKey: "responsible.limits.deposit.title", descriptionKey: "responsible.limits.deposit.body" },
  stake: { titleKey: "responsible.limits.stake.title", descriptionKey: "responsible.limits.stake.body" },
  loss: { titleKey: "responsible.limits.loss.title", descriptionKey: "responsible.limits.loss.body" },
  single_bet: { titleKey: "responsible.limits.singleBet.title", descriptionKey: "responsible.limits.singleBet.body" },
};

/**
 * The player's limits, breaks and exclusion status — real, stored, enforced.
 * A guest sees an invitation to sign in instead, because there is no account to
 * attach a limit to.
 */
export async function ResponsibleTools() {
  const [t, locale, user] = await Promise.all([getT(), getRequestLocale(), getCurrentUser()]);

  if (!user || user.role !== "player") {
    return (
      <Alert tone="info" title={t("responsible.signInTitle")}>
        <span className="flex flex-wrap items-center gap-3">
          {t("responsible.signInBody")}
          <Link href="/login?next=/account/responsible" className={buttonStyles({ size: "sm" })}>
            {t("nav.login")}
          </Link>
        </span>
      </Alert>
    );
  }

  const [limits, exclusions, coolingOffHours] = await Promise.all([
    getResponsibleGamblingLimits(),
    getSelfExclusions(),
    getSetting("responsible.limitIncreaseCoolingOffHours"),
  ]);

  const active = exclusions.filter(isInForce);

  const byKind = (kind: LimitKind): ResponsibleGamblingLimit[] =>
    limits.filter((limit) => limit.kind === kind);

  return (
    <div className="space-y-6">
      {active.length > 0 ? (
        <Alert tone="danger" title={t("responsible.active.title")}>
          <ul className="space-y-1">
            {active.map((entry) => (
              <li key={entry.id} className="flex items-start gap-2">
                <Lock size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
                {entry.endsAt
                  ? t(`responsible.active.${entry.kind}`, { date: formatDateTime(entry.endsAt, locale) })
                  : t("responsible.active.permanent")}
              </li>
            ))}
          </ul>
          <p className="mt-2 flex items-start gap-2 text-small">
            <Info size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
            {t("responsible.active.note")}
          </p>
        </Alert>
      ) : null}

      <div className="space-y-6">
        {KINDS.map((kind) => (
          <div key={kind} className="space-y-3">
            {byKind(kind).map((limit) => (
              <LimitControl
                key={limit.id}
                limit={limit}
                {...COPY[kind]}
                coolingOffHours={coolingOffHours}
              />
            ))}
            <NewLimitForm
              kind={kind}
              {...COPY[kind]}
              takenPeriods={byKind(kind).map((limit) => limit.period)}
            />
          </div>
        ))}
      </div>

      <BreakControls />
    </div>
  );
}
