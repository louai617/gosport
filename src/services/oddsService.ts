import { getDataset } from "@/data";
import type { MockDataset } from "@/data/types";
import type { MarketKey, MarketWithSelections, OddsMovement, Selection } from "@/types";
import { getDatasetIndex } from "./utils";

/**
 * Markets, prices and the demo price ticker.
 *
 * ── SIMULATED PRICES ──────────────────────────────────────────────────────
 * Every number this module returns is generated. `subscribeToOddsUpdates` is
 * an animation source, not a market feed: it invents small movements on a
 * fixed cadence so the odds-change treatment can be evaluated in the browser.
 * No exchange, trading desk or pricing engine is involved, no price here can
 * be traded on, and nothing can be settled against it.
 * ──────────────────────────────────────────────────────────────────────────
 */

/**
 * Market keys eligible to be the headline market on a compact card, in order
 * of preference — three-way first, then the two-way equivalents.
 */
const MAIN_MARKET_KEYS: MarketKey[] = ["1x2", "moneyline", "match_winner"];

/**
 * Joins an event's markets to their selections, grouped as the market list
 * renders them: groups keep the order the feed introduced them in, and
 * markets are sorted by `order` inside each group.
 *
 * Exported because `sportsService` builds the same structure into `EventDetail`.
 */
export function toMarketsWithSelections(
  dataset: MockDataset,
  eventId: string,
): MarketWithSelections[] {
  const index = getDatasetIndex(dataset);
  const markets = index.marketsByEventId.get(eventId) ?? [];

  const groups = new Map<string, MarketWithSelections[]>();
  for (const market of markets) {
    const withSelections: MarketWithSelections = {
      ...market,
      selections: resolveSelections(dataset, market.selectionIds, market.id),
    };
    const bucket = groups.get(market.groupKey);
    if (bucket) bucket.push(withSelections);
    else groups.set(market.groupKey, [withSelections]);
  }

  const ordered: MarketWithSelections[] = [];
  for (const bucket of groups.values()) {
    bucket.sort((a, b) => a.order - b.order);
    ordered.push(...bucket);
  }
  return ordered;
}

/**
 * `selectionIds` is authoritative for ordering (home, draw, away must not be
 * shuffled), with the market index as the fallback when the list is empty.
 */
function resolveSelections(
  dataset: MockDataset,
  selectionIds: string[],
  marketId: string,
): Selection[] {
  const index = getDatasetIndex(dataset);
  if (selectionIds.length === 0) return index.selectionsByMarketId.get(marketId) ?? [];

  const resolved: Selection[] = [];
  for (const id of selectionIds) {
    const selection = index.selectionsById.get(id);
    if (selection) resolved.push(selection);
  }
  return resolved;
}

export async function getMarketsForEvent(eventId: string): Promise<MarketWithSelections[]> {
  return toMarketsWithSelections(getDataset(), eventId);
}

/** The headline market shown on match cards and above the market list. */
export async function getMainMarket(eventId: string): Promise<MarketWithSelections | null> {
  const markets = await getMarketsForEvent(eventId);
  for (const key of MAIN_MARKET_KEYS) {
    const match = markets.find((market) => market.key === key);
    if (match) return match;
  }
  return markets[0] ?? null;
}

export async function getSelectionById(id: string): Promise<Selection | null> {
  return getDatasetIndex(getDataset()).selectionsById.get(id) ?? null;
}

/* ------------------------------------------------------------ price ticker */

export interface OddsUpdate {
  selectionId: string;
  odds: number;
  previousOdds: number;
  movement: OddsMovement;
}

export interface OddsSubscriptionOptions {
  intervalMs?: number;
}

const DEFAULT_INTERVAL_MS = 6_000;
/** Only a handful of prices move per tick — a board that twitches everywhere reads as noise. */
const MOVES_PER_TICK = 3;
/** Relative steps applied to a price. Small enough to stay plausible. */
const DRIFT_STEPS = [-0.06, -0.04, -0.02, 0.02, 0.04, 0.06];
const MIN_ODDS = 1.02;
const MAX_ODDS = 51;

/**
 * Prices currently on screen, shared by every subscriber in the tab so two
 * components watching the same selection never disagree. The server's rendered
 * odds stay authoritative — this drift is display-only and is discarded on
 * navigation.
 */
const priceBook = new Map<string, number>();

/** FNV-1a: cheap, stable across runs, and good enough to decorrelate ids. */
function hash32(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministic 0..1 for a (selection, tick) pair.
 *
 * `Math.random()` would make the demo behave differently on every run and on
 * every machine; a hashed walk gives the same sequence every time, which makes
 * the animation reviewable and reproducible.
 */
function noise(selectionId: string, tick: number): number {
  const mixed = Math.imul(hash32(selectionId) ^ (tick + 0x9e3779b9), 0x85ebca6b) >>> 0;
  return mixed / 0xffffffff;
}

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Starts a simulated price ticker for the given selections.
 *
 * Safe to call directly from `useEffect`: it is a no-op on the server, tolerates
 * an empty id list, and the returned function clears the timer. `onUpdate` is
 * called with only the selections that actually moved.
 */
export function subscribeToOddsUpdates(
  selectionIds: string[],
  onUpdate: (updates: OddsUpdate[]) => void,
  options?: OddsSubscriptionOptions,
): () => void {
  const noop = () => {};
  // Server render: no timers, no state, nothing to tear down.
  if (typeof window === "undefined" || selectionIds.length === 0) return noop;

  const index = getDatasetIndex(getDataset());
  const tracked = selectionIds.filter((id) => {
    const selection = index.selectionsById.get(id);
    if (!selection || !selection.active) return false;
    if (!priceBook.has(id)) priceBook.set(id, selection.odds);
    return true;
  });

  if (tracked.length === 0) return noop;

  const intervalMs = Math.max(1_000, options?.intervalMs ?? DEFAULT_INTERVAL_MS);
  let tick = 0;

  const timer = window.setInterval(() => {
    tick += 1;

    const movers = tracked
      .map((id) => ({ id, roll: noise(id, tick) }))
      .sort((a, b) => b.roll - a.roll)
      .slice(0, Math.min(MOVES_PER_TICK, tracked.length));

    const updates: OddsUpdate[] = [];
    for (const { id } of movers) {
      const previousOdds = priceBook.get(id);
      if (previousOdds === undefined) continue;

      const step = DRIFT_STEPS[Math.floor(noise(id, tick * 31 + 7) * DRIFT_STEPS.length)];
      const odds = round2(
        Math.min(MAX_ODDS, Math.max(MIN_ODDS, previousOdds * (1 + step))),
      );
      if (odds === previousOdds) continue;

      priceBook.set(id, odds);
      updates.push({
        selectionId: id,
        odds,
        previousOdds,
        movement: odds > previousOdds ? "up" : "down",
      });
    }

    if (updates.length > 0) onUpdate(updates);
  }, intervalMs);

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(timer);
  };
}
