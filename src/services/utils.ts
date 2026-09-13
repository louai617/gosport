import { JURISDICTION } from "@/config/app.config";
import { normalise } from "@/lib/search";
import type { MockDataset } from "@/data/types";
import type {
  Competition,
  Country,
  Market,
  Paginated,
  Selection,
  Sport,
  SportEvent,
  Team,
} from "@/types";

/**
 * Helpers shared by two or more services. Anything used by a single service
 * stays with that service.
 */

/** Upper bound on `pageSize` so a crafted query cannot ask for the whole table. */
const MAX_PAGE_SIZE = 100;

export function paginate<T>(items: T[], page = 1, pageSize = 20): Paginated<T> {
  const size = Math.min(Math.max(Math.trunc(pageSize) || 1, 1), MAX_PAGE_SIZE);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(Math.trunc(page) || 1, 1), totalPages);
  const start = (current - 1) * size;

  return {
    items: items.slice(start, start + size),
    page: current,
    pageSize: size,
    total,
    totalPages,
  };
}

// Lives in `lib` so the client-side league filter folds text the same way the
// server-side search does; re-exported here for the services that use it.
export { normalise } from "@/lib/search";

/** Substring test on folded forms. `needle` is folded here, not by the caller. */
export function containsNormalised(haystack: string, needle: string): boolean {
  const folded = normalise(needle);
  return folded.length === 0 || normalise(haystack).includes(folded);
}

/** Narrows the `T | T[]` filter shape services accept into a plain list. */
export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

export function indexBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) map.set(keyOf(item), item);
  return map;
}

export function groupBy<T>(items: T[], keyOf: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}

/** `en-CA` is the shortest route to a YYYY-MM-DD key. */
const dayKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: JURISDICTION.timezone,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * Calendar day in the jurisdiction's timezone. Fixtures are grouped by local
 * day: a 22:00 kick-off in Tunis belongs to that evening, not to the next UTC
 * day it would fall into during summer time.
 */
export function appDayKey(value: string | number | Date): string {
  return dayKeyFormatter.format(typeof value === "string" ? new Date(value) : value);
}

export type SortDirection = "asc" | "desc";

/** Whitelist of sortable fields per list — a query cannot reach into arbitrary keys. */
export type SortAccessors<T> = Record<string, (item: T) => string | number>;

export function sortItems<T>(
  items: T[],
  accessors: SortAccessors<T>,
  sort?: string,
  direction: SortDirection = "asc",
): T[] {
  const accessor = sort ? accessors[sort] : undefined;
  if (!accessor) return items;

  const factor = direction === "desc" ? -1 : 1;
  return [...items].sort((a, b) => {
    const left = accessor(a);
    const right = accessor(b);
    if (typeof left === "number" && typeof right === "number") {
      return (left - right) * factor;
    }
    return String(left).localeCompare(String(right)) * factor;
  });
}

/* --------------------------------------------------------------- dataset index */

export interface DatasetIndex {
  sportsById: Map<string, Sport>;
  sportsByKey: Map<string, Sport>;
  countriesById: Map<string, Country>;
  competitionsById: Map<string, Competition>;
  teamsById: Map<string, Team>;
  eventsById: Map<string, SportEvent>;
  marketsById: Map<string, Market>;
  marketsByEventId: Map<string, Market[]>;
  selectionsById: Map<string, Selection>;
  selectionsByMarketId: Map<string, Selection[]>;
}

/**
 * Joining an event touches five tables, and a competition page joins a few
 * hundred events — linear scans add up quickly. The index is built once per
 * dataset object and held weakly so a regenerated dataset is not pinned.
 */
const indexCache = new WeakMap<MockDataset, DatasetIndex>();

export function getDatasetIndex(dataset: MockDataset): DatasetIndex {
  const cached = indexCache.get(dataset);
  if (cached) return cached;

  const index: DatasetIndex = {
    sportsById: indexBy(dataset.sports, (sport) => sport.id),
    sportsByKey: indexBy(dataset.sports, (sport) => sport.key),
    countriesById: indexBy(dataset.countries, (country) => country.id),
    competitionsById: indexBy(dataset.competitions, (competition) => competition.id),
    teamsById: indexBy(dataset.teams, (team) => team.id),
    eventsById: indexBy(dataset.events, (event) => event.id),
    marketsById: indexBy(dataset.markets, (market) => market.id),
    marketsByEventId: groupBy(dataset.markets, (market) => market.eventId),
    selectionsById: indexBy(dataset.selections, (selection) => selection.id),
    selectionsByMarketId: groupBy(dataset.selections, (selection) => selection.marketId),
  };

  indexCache.set(dataset, index);
  return index;
}
