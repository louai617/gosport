import { JURISDICTION } from "@/config/app.config";
import type { PeriodPreset } from "@/lib/adminValidation";
import {
  addZonedDays,
  startOfZonedDate,
  startOfZonedDay,
  startOfZonedMonth,
  zonedDayKey,
} from "@/lib/zonedTime";

/**
 * Reporting periods, in the platform's calendar.
 *
 * `from` is inclusive and `to` is **exclusive** — "Today" is
 * `[00:00 today, 00:00 tomorrow)` — so adjacent periods tile with no gap and no
 * double-counted millisecond. Custom ranges are given as inclusive local dates
 * and converted to the same half-open form.
 */
export interface ResolvedPeriod {
  preset: PeriodPreset;
  from: Date;
  to: Date;
  /** Hourly buckets for a one- or two-day window, daily otherwise. */
  bucket: "hour" | "day";
  /** Inclusive local dates for the form fields. */
  fromDay: string;
  toDay: string;
}

const MAX_DAYS = 366;

function parseDay(value: string | undefined, timeZone: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return startOfZonedDate(year, month, day, timeZone);
}

export function resolvePeriod(
  preset: PeriodPreset,
  custom: { from?: string; to?: string } = {},
  now = new Date(),
  timeZone = JURISDICTION.timezone,
): ResolvedPeriod {
  const today = startOfZonedDay(now, timeZone);
  const tomorrow = addZonedDays(now, 1, timeZone);

  let from: Date;
  let to: Date;
  let effective: PeriodPreset = preset;

  switch (preset) {
    case "today":
      from = today;
      to = tomorrow;
      break;
    case "yesterday":
      from = addZonedDays(now, -1, timeZone);
      to = today;
      break;
    case "last7":
      from = addZonedDays(now, -6, timeZone);
      to = tomorrow;
      break;
    case "last30":
      from = addZonedDays(now, -29, timeZone);
      to = tomorrow;
      break;
    case "thisMonth":
      from = startOfZonedMonth(now, timeZone);
      to = tomorrow;
      break;
    case "lastMonth":
      from = startOfZonedMonth(now, timeZone, -1);
      to = startOfZonedMonth(now, timeZone);
      break;
    case "custom": {
      const start = parseDay(custom.from, timeZone);
      const end = parseDay(custom.to, timeZone);
      if (start && end && end >= start) {
        from = start;
        to = addZonedDays(end, 1, timeZone);
        // Bound the work a crafted range can ask for.
        const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
        if (days > MAX_DAYS) from = addZonedDays(to, -MAX_DAYS, timeZone);
      } else {
        // Unusable custom input falls back to the default rather than erroring.
        effective = "last7";
        from = addZonedDays(now, -6, timeZone);
        to = tomorrow;
      }
      break;
    }
  }

  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000);
  return {
    preset: effective,
    from,
    to,
    bucket: days <= 2 ? "hour" : "day",
    fromDay: zonedDayKey(from, timeZone),
    toDay: zonedDayKey(new Date(to.getTime() - 1), timeZone),
  };
}

/** Bucket start instants covering the period, in order. */
export function bucketStarts(period: ResolvedPeriod, timeZone = JURISDICTION.timezone): Date[] {
  const starts: Date[] = [];
  if (period.bucket === "hour") {
    for (let t = period.from.getTime(); t < period.to.getTime(); t += 3_600_000) {
      starts.push(new Date(t));
    }
    return starts;
  }
  let cursor = period.from;
  while (cursor < period.to) {
    starts.push(cursor);
    cursor = addZonedDays(new Date(cursor.getTime() + 12 * 3_600_000), 1, timeZone);
  }
  return starts;
}

/** Index of the bucket an instant falls into (starts must be sorted). */
export function bucketIndex(starts: Date[], at: Date): number {
  let low = 0;
  let high = starts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (starts[mid]!.getTime() <= at.getTime()) low = mid;
    else high = mid - 1;
  }
  return low;
}
