/**
 * SportGo — sportsbook domain model.
 *
 * These interfaces are the contract between the UI and the data layer. The
 * mock provider in `src/data` and any future real feed provider must both
 * satisfy them, so no component ever imports mock data directly.
 */

export type SportKey =
  | "football"
  | "basketball"
  | "tennis"
  | "handball"
  | "volleyball"
  | "rugby"
  | "boxing"
  | "formula1";

/** Icon identifiers resolved by `components/sports/SportIcon.tsx`. */
export type SportIconName = SportKey | "trophy" | "star" | "grid";

export interface Sport {
  id: string;
  key: SportKey;
  /** i18n key, e.g. `sports.football`. Never a display string. */
  nameKey: string;
  icon: SportIconName;
  /** Ordering in the sports navigation (ascending). */
  order: number;
  eventCount: number;
  liveEventCount: number;
}

export interface Country {
  id: string;
  /** ISO 3166-1 alpha-2, uppercase. */
  code: string;
  nameKey: string;
  /** Unicode regional-indicator flag; purely decorative, always aria-hidden. */
  flag: string;
}

export interface Competition {
  id: string;
  sportId: string;
  countryId: string;
  /** Proper noun — displayed as-is, not translated. */
  name: string;
  shortName: string;
  /** `true` for competitions surfaced in "Popular competitions". */
  popular: boolean;
  eventCount: number;
  liveEventCount: number;
  /** Two-letter monogram used by the placeholder crest component. */
  monogram: string;
  /** Hue (0-360) used to derive the deterministic placeholder crest colour. */
  hue: number;
}

export interface Team {
  id: string;
  name: string;
  shortName: string;
  /** Three-letter code shown on compact cards. */
  code: string;
  countryId: string;
  monogram: string;
  hue: number;
  /**
   * Optional path to a locally-hosted, licence-cleared crest.
   * Left undefined in demo mode — `TeamCrest` renders a generated placeholder.
   */
  crestUrl?: string;
}

export type EventStatus = "scheduled" | "live" | "finished" | "cancelled" | "postponed";

export interface EventScore {
  home: number;
  away: number;
  /** Per-period breakdown (sets, quarters, halves). Optional per sport. */
  periods?: Array<{ labelKey: string; home: number; away: number }>;
}

export interface LiveState {
  /** Minutes elapsed for clock sports; period number otherwise. */
  minute?: number;
  /** i18n key for the phase, e.g. `live.firstHalf`, `live.set2`. */
  periodKey: string;
  /** 0-100, used by the live progress bar. */
  progress: number;
  addedTime?: number;
}

export interface SportEvent {
  id: string;
  sportId: string;
  competitionId: string;
  homeTeamId: string;
  awayTeamId: string;
  /** ISO-8601 UTC. Always formatted through `lib/format` with the app timezone. */
  startTime: string;
  status: EventStatus;
  score?: EventScore;
  live?: LiveState;
  /** Featured on the homepage hero. At most one per sport. */
  featured: boolean;
  /** Total number of markets available, including those not rendered inline. */
  marketCount: number;
  /** Ids of markets attached to this event. */
  marketIds: string[];
  /** True when a live video/tracker would be offered (demo: never streams). */
  hasTracker: boolean;
}

/** Canonical market templates SportGo knows how to render. */
export type MarketKey =
  | "1x2"
  | "double_chance"
  | "over_under"
  | "btts"
  | "moneyline"
  | "handicap"
  | "total_points"
  | "correct_score"
  | "next_goal"
  | "match_winner";

export type MarketStatus = "open" | "suspended" | "settled" | "closed";

export interface Market {
  id: string;
  eventId: string;
  key: MarketKey;
  /** i18n key for the market name, e.g. `markets.1x2`. */
  nameKey: string;
  /** i18n key for the group heading, e.g. `marketGroups.mainMarkets`. */
  groupKey: string;
  status: MarketStatus;
  /** Line for handicap/total markets (e.g. 2.5). */
  line?: number;
  /** Display order inside its group. */
  order: number;
  selectionIds: string[];
}

export type SelectionOutcome =
  | "home" | "draw" | "away"
  | "over" | "under"
  | "yes" | "no"
  | "home_or_draw" | "home_or_away" | "draw_or_away"
  | "other";

export type OddsMovement = "up" | "down" | "none";

export interface Selection {
  id: string;
  marketId: string;
  eventId: string;
  outcome: SelectionOutcome;
  /**
   * i18n key OR a literal when the label is a team name.
   * Use `labelKey` when translatable, `label` when it is a proper noun.
   */
  labelKey?: string;
  label?: string;
  /** Decimal odds. Simulated in demo mode — never a real price. */
  odds: number;
  /** Previous price, used to animate movement. */
  previousOdds?: number;
  movement: OddsMovement;
  active: boolean;
}

/** A market with its selections resolved — what market UI components receive. */
export interface MarketWithSelections extends Market {
  selections: Selection[];
}

/** Everything a match card or event page needs, already joined. */
export interface EventDetail extends SportEvent {
  sport: Sport;
  competition: Competition;
  country: Country;
  homeTeam: Team;
  awayTeam: Team;
  markets: MarketWithSelections[];
}

/** A finished event as shown on /results. */
export interface EventResult {
  event: EventDetail;
  /** i18n key describing how it ended, e.g. `results.fullTime`. */
  outcomeKey: string;
}

export interface CompetitionWithEvents {
  competition: Competition;
  country: Country;
  events: EventDetail[];
}
