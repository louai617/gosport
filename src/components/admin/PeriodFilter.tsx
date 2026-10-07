import Link from "next/link";
import { CalendarRange } from "lucide-react";
import { PERIOD_PRESETS, type PeriodPreset } from "@/lib/adminValidation";
import { cn } from "@/lib/cn";
import { getAdminT } from "@/i18n/server";
import { Button } from "@/components/ui/Button";

export interface PeriodFilterProps {
  basePath: string;
  active: PeriodPreset;
  fromDay: string;
  toDay: string;
}

/**
 * Date-range filter: presets as links, a custom range as a plain GET form. No
 * client state at all — the URL *is* the filter, so a view can be shared and
 * the back button works, and it keeps working with scripting disabled.
 */
export async function PeriodFilter({ basePath, active, fromDay, toDay }: PeriodFilterProps) {
  const t = await getAdminT();
  const presets = PERIOD_PRESETS.filter((preset) => preset !== "custom");

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <nav aria-label={t("admin.period.label")}>
        <ul className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <li key={preset}>
              <Link
                href={`${basePath}?period=${preset}`}
                aria-current={active === preset ? "true" : undefined}
                className={cn(
                  "flex h-8 items-center rounded-md border px-3 text-small transition-colors duration-fast",
                  active === preset
                    ? "border-primary/40 bg-primary-soft font-semibold text-primary"
                    : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink",
                )}
              >
                {t(`admin.period.${preset}`)}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <form method="get" action={basePath} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="period" value="custom" />
        <label className="space-y-1">
          <span className="block text-caption normal-case tracking-normal text-ink-subtle">
            {t("admin.filter.from")}
          </span>
          <input
            type="date"
            name="from"
            required
            defaultValue={fromDay}
            className="h-8 rounded-md border border-line bg-surface-2 px-2 text-small text-ink hover:border-line-strong focus:border-primary"
          />
        </label>
        <label className="space-y-1">
          <span className="block text-caption normal-case tracking-normal text-ink-subtle">
            {t("admin.filter.to")}
          </span>
          <input
            type="date"
            name="to"
            required
            defaultValue={toDay}
            className="h-8 rounded-md border border-line bg-surface-2 px-2 text-small text-ink hover:border-line-strong focus:border-primary"
          />
        </label>
        <Button type="submit" variant={active === "custom" ? "primary" : "secondary"} size="sm">
          <CalendarRange size={14} aria-hidden="true" />
          {t("admin.period.custom")}
        </Button>
      </form>
    </div>
  );
}
