/**
 * Calendar arithmetic in a named time zone.
 *
 * "Today" on a dashboard and "this week" in a spending limit mean the *platform's*
 * local calendar (Africa/Tunis), not the server's and not UTC — a bet placed at
 * 00:30 in Tunis belongs to the new day even though it is still yesterday in UTC.
 * Everything here converts through `Intl`, so it stays correct if the zone has
 * daylight saving.
 *
 * Isomorphic and dependency-free.
 */

const MS_PER_DAY = 86_400_000;

interface Parts {
  year: number;
  month: number; // 1-12
  day: number;
  /** 1 = Monday … 7 = Sunday. */
  isoWeekday: number;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let existing = formatters.get(timeZone);
  if (!existing) {
    existing = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      weekday: "short",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hourCycle: "h23",
    });
    formatters.set(timeZone, existing);
  }
  return existing;
}

function read(date: Date, timeZone: string) {
  const out: Record<string, string> = {};
  for (const part of formatter(timeZone).formatToParts(date)) out[part.type] = part.value;
  return out;
}

export function zonedParts(date: Date, timeZone: string): Parts {
  const p = read(date, timeZone);
  return {
    year: Number(p.year),
    month: Number(p.month),
    day: Number(p.day),
    isoWeekday: WEEKDAYS[p.weekday ?? "Mon"] ?? 1,
  };
}

/** Offset (ms) of `timeZone` from UTC at the given instant. */
function offsetAt(date: Date, timeZone: string): number {
  const p = read(date, timeZone);
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second),
  );
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** The instant at which the given local calendar date begins in `timeZone`. */
export function startOfZonedDate(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date {
  const guess = Date.UTC(year, month - 1, day);
  // Two passes settle the offset across a DST boundary.
  let instant = guess - offsetAt(new Date(guess), timeZone);
  instant = guess - offsetAt(new Date(instant), timeZone);
  return new Date(instant);
}

export function startOfZonedDay(date: Date, timeZone: string): Date {
  const { year, month, day } = zonedParts(date, timeZone);
  return startOfZonedDate(year, month, day, timeZone);
}

/** Midnight `days` calendar days from the start of `date`'s local day. */
export function addZonedDays(date: Date, days: number, timeZone: string): Date {
  const { year, month, day } = zonedParts(date, timeZone);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return startOfZonedDate(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
    timeZone,
  );
}

/** Monday 00:00 local. */
export function startOfZonedWeek(date: Date, timeZone: string): Date {
  const { isoWeekday } = zonedParts(date, timeZone);
  return addZonedDays(date, -(isoWeekday - 1), timeZone);
}

export function startOfZonedMonth(date: Date, timeZone: string, monthOffset = 0): Date {
  const { year, month } = zonedParts(date, timeZone);
  const shifted = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  return startOfZonedDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1, timeZone);
}

/** `YYYY-MM-DD` of the local calendar day. */
export function zonedDayKey(date: Date, timeZone: string): string {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export { MS_PER_DAY };
