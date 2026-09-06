import type {
  BetSlipItem,
  EventDetail,
  Market,
  MarketWithSelections,
  Selection,
} from "@/types";
import type { TranslateFn } from "@/i18n/types";

/**
 * Resolving a selection's display label.
 *
 * A selection carries either an i18n key (Draw, Over, Yes) or a literal proper
 * noun (a club name). Team names are never translated, so the two cases have
 * to stay distinct all the way to the render.
 */
export function selectionLabel(
  selection: Selection,
  market: Pick<Market, "line">,
  t: TranslateFn,
): string {
  if (selection.label) return selection.label;
  if (!selection.labelKey) return "";
  return t(selection.labelKey, market.line === undefined ? undefined : { line: market.line });
}

/** "Match Result", "Over/Under 2.5" — the market name with its line applied. */
export function marketLabel(market: Pick<Market, "nameKey" | "line">, t: TranslateFn): string {
  const name = t(market.nameKey);
  return market.line === undefined ? name : `${name} ${market.line}`;
}

/** "Espérance — Club Africain" */
export function eventLabel(event: Pick<EventDetail, "homeTeam" | "awayTeam">): string {
  return `${event.homeTeam.shortName} — ${event.awayTeam.shortName}`;
}

/**
 * Flattens a selection into the denormalised shape the bet slip stores, so the
 * slip renders without refetching the event it came from.
 */
export function toBetSlipItem(
  selection: Selection,
  market: MarketWithSelections,
  event: EventDetail,
  t: TranslateFn,
): Omit<BetSlipItem, "stake" | "addedAt"> {
  return {
    id: selection.id,
    selectionId: selection.id,
    marketId: market.id,
    eventId: event.id,
    eventLabel: eventLabel(event),
    competitionLabel: event.competition.name,
    marketNameKey: market.nameKey,
    marketKey: market.key,
    marketLine: market.line,
    outcome: selection.outcome,
    selectionLabelKey: selection.labelKey,
    selectionLabel: selection.label ?? selectionLabel(selection, market, t),
    odds: selection.odds,
    previousOdds: selection.previousOdds,
    suspended: market.status !== "open" || !selection.active,
    startTime: event.startTime,
  };
}

/**
 * The short column header shown above a three-way price row: 1 / X / 2 for
 * home-draw-away, and the team codes for two-way markets.
 */
export function outcomeShortLabel(
  selection: Selection,
  event: Pick<EventDetail, "homeTeam" | "awayTeam">,
  t: TranslateFn,
): string {
  switch (selection.outcome) {
    case "home":
      return t("selections.1");
    case "draw":
      return t("selections.x");
    case "away":
      return t("selections.2");
    case "home_or_draw":
      return "1X";
    case "home_or_away":
      return "12";
    case "draw_or_away":
      return "X2";
    // The market heading already carries the line ("Over/Under 2.5"), so the
    // button caption stays short enough not to truncate in any language.
    case "over":
      return t("selections.overShort");
    case "under":
      return t("selections.underShort");
    case "yes":
      return t("selections.yes");
    case "no":
      return t("selections.no");
    default:
      return event.homeTeam.code;
  }
}
