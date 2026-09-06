import type {
  EventScore,
  LiveState,
  Market,
  MarketKey,
  MarketStatus,
  Selection,
  SelectionOutcome,
  SportEvent,
  SportKey,
} from "@/types";
import {
  COMPETITIONS,
  COMPETITION_ROSTERS,
  HERO_FIXTURE,
  SPORT_BY_ID,
  TEAM_BY_ID,
  TEAM_STRENGTH,
  type CompetitionSeed,
} from "./catalog";
import { chance, hashString, range, round2, seeded, type Rng } from "./rng";

/**
 * Fixture and price generation.
 *
 * ── SIMULATED ─────────────────────────────────────────────────────────────
 * Nothing here is a market price. Odds are produced by a small probability
 * model — Poisson for goal sports, a normal margin model for points sports —
 * and then loaded with a house margin so the book overrounds the way a real
 * one would. The point is that the numbers on screen are *internally
 * consistent* (double chance agrees with 1X2, over/under agrees with BTTS),
 * not that they reflect any real market.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Everything is derived from `nowMs` through a seeded PRNG, so the same
 * instant always produces the same board. That determinism is what keeps the
 * server and client renders identical.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Book margin. 6% is a plausible headline figure for a main football market. */
const MARGIN = 0.06;
const MARGIN_SECONDARY = 0.075;

const MIN_ODDS = 1.01;
const MAX_ODDS = 51;

/* ========================================================================== */
/*  Pricing primitives                                                        */
/* ========================================================================== */

function clampOdds(value: number): number {
  return round2(Math.min(MAX_ODDS, Math.max(MIN_ODDS, value)));
}

/**
 * Turns fair probabilities into offered decimal odds.
 *
 * With probabilities normalised to 1, multiplying by `overround` makes the
 * implied probabilities sum to `overround` — which is exactly the margin
 * definition a trader would use.
 */
function priceFromProbabilities(probabilities: number[], overround: number): number[] {
  const total = probabilities.reduce((sum, p) => sum + p, 0) || 1;
  return probabilities.map((p) => clampOdds(1 / ((p / total) * overround)));
}

/** Poisson pmf, memo-free — the loops here are tiny. */
function poissonPmf(lambda: number, k: number): number {
  let result = Math.exp(-lambda);
  for (let i = 1; i <= k; i += 1) result *= lambda / i;
  return result;
}

const MAX_GOALS = 9;

interface GoalModel {
  home: number;
  draw: number;
  away: number;
  /** P(total goals > line) keyed by line. */
  over: Record<string, number>;
  bttsYes: number;
}

/**
 * Independent-Poisson scoreline model. Crude next to a real pricing engine,
 * but it is the reason every derived market agrees with its parent.
 */
function goalModel(lambdaHome: number, lambdaAway: number): GoalModel {
  const homeP: number[] = [];
  const awayP: number[] = [];
  for (let i = 0; i <= MAX_GOALS; i += 1) {
    homeP.push(poissonPmf(lambdaHome, i));
    awayP.push(poissonPmf(lambdaAway, i));
  }

  let home = 0;
  let draw = 0;
  let away = 0;
  let bttsYes = 0;
  const totals: number[] = new Array(MAX_GOALS * 2 + 1).fill(0);

  for (let i = 0; i <= MAX_GOALS; i += 1) {
    for (let j = 0; j <= MAX_GOALS; j += 1) {
      const p = homeP[i]! * awayP[j]!;
      if (i > j) home += p;
      else if (i === j) draw += p;
      else away += p;
      if (i > 0 && j > 0) bttsYes += p;
      totals[i + j] = (totals[i + j] ?? 0) + p;
    }
  }

  const over: Record<string, number> = {};
  for (const line of [0.5, 1.5, 2.5, 3.5, 4.5]) {
    let cumulative = 0;
    for (let total = Math.ceil(line); total < totals.length; total += 1) {
      cumulative += totals[total] ?? 0;
    }
    over[String(line)] = cumulative;
  }

  return { home, draw, away, over, bttsYes };
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26). */
function normalCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-z * z);
  return 0.5 * (1 + sign * y);
}

/* ========================================================================== */
/*  Sport profiles                                                            */
/* ========================================================================== */

interface SportProfile {
  /** Markets to generate, in display order. */
  markets: MarketKey[];
  /** Does the sport allow a draw in its main market? */
  hasDraw: boolean;
  /** Typical total for points sports, used to seed the totals line. */
  baseTotal?: number;
  totalSpread?: number;
  /** Standard deviation of the winning margin. */
  marginSd?: number;
  /** Expected margin at maximum strength difference. */
  marginScale?: number;
  periodKeys: string[];
  /** Regulation length in minutes, for the live clock. */
  durationMinutes: number;
}

const PROFILES: Record<SportKey, SportProfile> = {
  football: {
    markets: ["1x2", "double_chance", "over_under", "btts", "handicap"],
    hasDraw: true,
    periodKeys: ["live.firstHalf", "live.secondHalf"],
    durationMinutes: 90,
  },
  basketball: {
    markets: ["moneyline", "handicap", "total_points"],
    hasDraw: false,
    baseTotal: 168,
    totalSpread: 22,
    marginSd: 11.5,
    marginScale: 22,
    periodKeys: ["live.quarter1", "live.quarter2", "live.quarter3", "live.quarter4"],
    durationMinutes: 48,
  },
  tennis: {
    markets: ["match_winner", "total_points"],
    hasDraw: false,
    baseTotal: 22,
    totalSpread: 4,
    marginSd: 3.2,
    marginScale: 6,
    periodKeys: ["live.set1", "live.set2", "live.set3", "live.set4", "live.set5"],
    durationMinutes: 120,
  },
  handball: {
    markets: ["1x2", "handicap", "total_points"],
    hasDraw: true,
    baseTotal: 55,
    totalSpread: 8,
    marginSd: 5.5,
    marginScale: 10,
    periodKeys: ["live.firstHalf", "live.secondHalf"],
    durationMinutes: 60,
  },
  volleyball: {
    markets: ["match_winner", "handicap"],
    hasDraw: false,
    baseTotal: 4,
    totalSpread: 1,
    marginSd: 1.2,
    marginScale: 2,
    periodKeys: ["live.set1", "live.set2", "live.set3", "live.set4", "live.set5"],
    durationMinutes: 100,
  },
  rugby: {
    markets: ["1x2", "handicap", "total_points"],
    hasDraw: true,
    baseTotal: 44,
    totalSpread: 12,
    marginSd: 12,
    marginScale: 24,
    periodKeys: ["live.firstHalf", "live.secondHalf"],
    durationMinutes: 80,
  },
  boxing: {
    markets: ["match_winner"],
    hasDraw: false,
    marginSd: 1,
    marginScale: 1,
    periodKeys: ["live.period1", "live.period2", "live.period3"],
    durationMinutes: 36,
  },
  formula1: {
    markets: ["match_winner"],
    hasDraw: false,
    marginSd: 1,
    marginScale: 1,
    periodKeys: ["live.period1"],
    durationMinutes: 110,
  },
};

/* ========================================================================== */
/*  Fixture scheduling                                                        */
/* ========================================================================== */

export interface FixtureBundle {
  events: SportEvent[];
  markets: Market[];
  selections: Selection[];
}

interface PlannedFixture {
  id: string;
  competition: CompetitionSeed;
  sportKey: SportKey;
  homeTeamId: string;
  awayTeamId: string;
  startMs: number;
  forcedStatus?: SportEvent["status"];
  featured?: boolean;
}

/** Kick-offs cluster in the evening; this picks a plausible local slot. */
const EVENING_SLOTS = [15, 16, 17, 18, 19, 20, 20, 21] as const;

function slotFor(rng: Rng, dayStartMs: number): number {
  const hour = EVENING_SLOTS[range(rng, 0, EVENING_SLOTS.length - 1)] ?? 20;
  const minute = chance(rng, 0.5) ? 0 : 30;
  return dayStartMs + hour * HOUR + minute * 60_000;
}

/** Midnight UTC of the day containing `ms`, offset by `dayDelta` days. */
function dayStart(ms: number, dayDelta: number): number {
  const date = new Date(ms + dayDelta * DAY);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * Rounds are laid out competition by competition so a league's fixtures share
 * a weekend, which is what makes the competition grouping on the sports page
 * look like a real calendar rather than noise.
 */
function planFixtures(nowMs: number): PlannedFixture[] {
  const planned: PlannedFixture[] = [];

  for (const competition of COMPETITIONS) {
    const roster = COMPETITION_ROSTERS[competition.id] ?? [];
    if (roster.length < 2) continue;

    const sport = SPORT_BY_ID.get(competition.sportId);
    if (!sport) continue;

    const rng = seeded(hashString(competition.id) ^ Math.floor(nowMs / DAY));

    // Bigger competitions carry more fixtures on the board.
    const roundsBack = competition.popular ? 2 : 1;
    const roundsForward = competition.popular ? 3 : 2;
    const perRound = Math.min(Math.floor(roster.length / 2), competition.popular ? 5 : 3);

    for (let round = -roundsBack; round <= roundsForward; round += 1) {
      // Rounds sit roughly three days apart, jittered so leagues do not all
      // land on the same evening.
      const dayDelta = round * 3 + range(rng, -1, 1);
      const base = dayStart(nowMs, dayDelta);

      const pool = [...roster];
      for (let match = 0; match < perRound && pool.length >= 2; match += 1) {
        const homeIndex = range(rng, 0, pool.length - 1);
        const [homeTeamId] = pool.splice(homeIndex, 1);
        const awayIndex = range(rng, 0, pool.length - 1);
        const [awayTeamId] = pool.splice(awayIndex, 1);
        if (!homeTeamId || !awayTeamId) break;

        const startMs = slotFor(rng, base) + range(rng, 0, 3) * 15 * 60_000;
        planned.push({
          id: `event-${competition.id}-${round + roundsBack}-${match}`,
          competition,
          sportKey: sport.key,
          homeTeamId,
          awayTeamId,
          startMs,
        });
      }
    }
  }

  return planned;
}

/**
 * In-play fixtures.
 *
 * These are placed explicitly rather than left to the scheduler. A fixture
 * only goes live if the wall clock happens to fall inside its 90 minutes, so
 * a purely schedule-driven board is empty for most of the day — and "no live
 * matches" is the one state a live section must not be stuck in.
 *
 * Kick-offs are set as a fraction of each sport's own duration so a basketball
 * game is a plausible number of minutes in, not a football number.
 */
const LIVE_PLAN: Array<{ competitionId: string; count: number }> = [
  { competitionId: "comp-tn-lp1", count: 3 },
  { competitionId: "comp-en-pl", count: 2 },
  { competitionId: "comp-es-laliga", count: 2 },
  { competitionId: "comp-caf-cl", count: 1 },
  { competitionId: "comp-nba", count: 2 },
  { competitionId: "comp-euroleague", count: 1 },
  { competitionId: "comp-atp", count: 2 },
  { competitionId: "comp-tn-handball", count: 1 },
  { competitionId: "comp-cev-cl", count: 1 },
];

function livePlannedFixtures(nowMs: number): PlannedFixture[] {
  const planned: PlannedFixture[] = [];

  for (const entry of LIVE_PLAN) {
    const competition = COMPETITIONS.find((item) => item.id === entry.competitionId);
    if (!competition) continue;

    const roster = COMPETITION_ROSTERS[competition.id] ?? [];
    if (roster.length < 2) continue;

    const sport = SPORT_BY_ID.get(competition.sportId);
    if (!sport) continue;

    const profile = PROFILES[sport.key];
    const rng = seeded(hashString(`live:${competition.id}`) ^ Math.floor(nowMs / (15 * 60_000)));
    const pool = [...roster];

    for (let index = 0; index < entry.count && pool.length >= 2; index += 1) {
      const [homeTeamId] = pool.splice(range(rng, 0, pool.length - 1), 1);
      const [awayTeamId] = pool.splice(range(rng, 0, pool.length - 1), 1);
      if (!homeTeamId || !awayTeamId) break;

      // 12%-85% through regulation time.
      const throughPlay = 0.12 + rng() * 0.73;
      const startMs = nowMs - throughPlay * profile.durationMinutes * 60_000;

      planned.push({
        id: `event-live-${competition.id}-${index}`,
        competition,
        sportKey: sport.key,
        homeTeamId,
        awayTeamId,
        startMs,
        forcedStatus: "live",
      });
    }
  }

  return planned;
}

/**
 * The homepage hero needs a specific, recognisable fixture that is always
 * upcoming — so it is placed explicitly rather than hoping the scheduler
 * produces something suitable.
 */
function heroFixture(nowMs: number): PlannedFixture {
  const competition = COMPETITIONS.find((entry) => entry.id === HERO_FIXTURE.competitionId);
  const today = dayStart(nowMs, 0) + 20 * HOUR;
  // If 20:00 has already passed, roll the derby to tomorrow evening.
  const startMs = today > nowMs + 30 * 60_000 ? today : dayStart(nowMs, 1) + 20 * HOUR;

  return {
    id: "event-hero-derby",
    competition: competition!,
    sportKey: "football",
    homeTeamId: HERO_FIXTURE.homeTeamId,
    awayTeamId: HERO_FIXTURE.awayTeamId,
    startMs,
    forcedStatus: "scheduled",
    featured: true,
  };
}

/* ========================================================================== */
/*  Live state & scores                                                       */
/* ========================================================================== */

function liveStateFor(
  profile: SportProfile,
  elapsedMinutes: number,
  rng: Rng,
): LiveState {
  const progress = Math.min(97, Math.max(3, (elapsedMinutes / profile.durationMinutes) * 100));
  const periodIndex = Math.min(
    profile.periodKeys.length - 1,
    Math.floor((progress / 100) * profile.periodKeys.length),
  );

  return {
    minute: Math.round(elapsedMinutes),
    periodKey: profile.periodKeys[periodIndex] ?? profile.periodKeys[0]!,
    progress: Math.round(progress),
    addedTime: chance(rng, 0.2) ? range(rng, 1, 5) : undefined,
  };
}

function scoreFor(
  sportKey: SportKey,
  profile: SportProfile,
  strengthHome: number,
  strengthAway: number,
  completion: number,
  rng: Rng,
): EventScore {
  if (sportKey === "football" || sportKey === "handball" || sportKey === "rugby") {
    const scale = sportKey === "football" ? 1 : sportKey === "handball" ? 14 : 7;
    const base = sportKey === "football" ? 1.35 : 1.9;
    const lambdaHome = (base + 1.1 * (strengthHome - strengthAway)) * scale * completion;
    const lambdaAway = (base - 1.1 * (strengthHome - strengthAway)) * scale * completion;

    return {
      home: Math.max(0, Math.round(lambdaHome + (rng() - 0.5) * Math.sqrt(lambdaHome + 1))),
      away: Math.max(0, Math.round(lambdaAway + (rng() - 0.5) * Math.sqrt(lambdaAway + 1))),
    };
  }

  if (sportKey === "tennis" || sportKey === "volleyball") {
    const homeSets = range(rng, 0, strengthHome > strengthAway ? 3 : 2);
    const awaySets = range(rng, 0, strengthAway > strengthHome ? 3 : 2);
    return { home: homeSets, away: awaySets };
  }

  // Points sports.
  const total = (profile.baseTotal ?? 160) * completion;
  const margin = (profile.marginScale ?? 20) * (strengthHome - strengthAway);
  return {
    home: Math.max(0, Math.round((total + margin) / 2 + (rng() - 0.5) * 6)),
    away: Math.max(0, Math.round((total - margin) / 2 + (rng() - 0.5) * 6)),
  };
}

/* ========================================================================== */
/*  Market construction                                                       */
/* ========================================================================== */

interface MarketDraft {
  key: MarketKey;
  nameKey: string;
  groupKey: string;
  order: number;
  line?: number;
  status: MarketStatus;
  outcomes: Array<{
    outcome: SelectionOutcome;
    labelKey?: string;
    label?: string;
    odds: number;
  }>;
}

const MARKET_META: Record<MarketKey, { nameKey: string; groupKey: string }> = {
  "1x2": { nameKey: "markets.1x2", groupKey: "marketGroups.main" },
  double_chance: { nameKey: "markets.doubleChance", groupKey: "marketGroups.main" },
  over_under: { nameKey: "markets.overUnder", groupKey: "marketGroups.goals" },
  btts: { nameKey: "markets.btts", groupKey: "marketGroups.goals" },
  moneyline: { nameKey: "markets.moneyline", groupKey: "marketGroups.main" },
  handicap: { nameKey: "markets.handicap", groupKey: "marketGroups.handicaps" },
  total_points: { nameKey: "markets.totalPoints", groupKey: "marketGroups.goals" },
  correct_score: { nameKey: "markets.correctScore", groupKey: "marketGroups.specials" },
  next_goal: { nameKey: "markets.nextGoal", groupKey: "marketGroups.specials" },
  match_winner: { nameKey: "markets.matchWinner", groupKey: "marketGroups.main" },
};

function buildMarketDrafts(
  sportKey: SportKey,
  homeName: string,
  awayName: string,
  strengthHome: number,
  strengthAway: number,
  isLive: boolean,
  completion: number,
  rng: Rng,
): MarketDraft[] {
  const profile = PROFILES[sportKey];
  const drafts: MarketDraft[] = [];
  // A live book prices the remainder of the match, so the model runs on the
  // time still to play.
  const remaining = isLive ? Math.max(0.08, 1 - completion) : 1;

  const draft = (
    key: MarketKey,
    order: number,
    outcomes: MarketDraft["outcomes"],
    line?: number,
  ): MarketDraft => ({
    key,
    ...MARKET_META[key],
    order,
    line,
    // A couple of live markets sit suspended, which the UI needs to handle.
    status: isLive && chance(rng, 0.08) ? "suspended" : "open",
    outcomes,
  });

  if (sportKey === "football") {
    const edge = strengthHome - strengthAway;
    const lambdaHome = Math.min(3.4, Math.max(0.35, (1.38 + 1.25 * edge) * remaining));
    const lambdaAway = Math.min(3.0, Math.max(0.3, (1.06 - 1.25 * edge) * remaining));
    const model = goalModel(lambdaHome, lambdaAway);

    const [oHome, oDraw, oAway] = priceFromProbabilities(
      [model.home, model.draw, model.away],
      1 + MARGIN,
    );

    drafts.push(
      draft("1x2", 1, [
        { outcome: "home", label: homeName, odds: oHome! },
        { outcome: "draw", labelKey: "selections.draw", odds: oDraw! },
        { outcome: "away", label: awayName, odds: oAway! },
      ]),
    );

    // Double chance is priced from the same probabilities, so the two markets
    // can never contradict each other.
    const [dcHd, dcHa, dcDa] = priceFromProbabilities(
      [model.home + model.draw, model.home + model.away, model.draw + model.away],
      2 * (1 + MARGIN_SECONDARY),
    );
    drafts.push(
      draft("double_chance", 2, [
        { outcome: "home_or_draw", labelKey: "selections.homeOrDraw", odds: dcHd! },
        { outcome: "home_or_away", labelKey: "selections.homeOrAway", odds: dcHa! },
        { outcome: "draw_or_away", labelKey: "selections.drawOrAway", odds: dcDa! },
      ]),
    );

    const lines = isLive ? [1.5, 2.5] : [1.5, 2.5, 3.5];
    lines.forEach((line, index) => {
      const overP = model.over[String(line)] ?? 0.5;
      const [over, under] = priceFromProbabilities(
        [overP, 1 - overP],
        1 + MARGIN_SECONDARY,
      );
      drafts.push(
        draft(
          "over_under",
          10 + index,
          [
            { outcome: "over", labelKey: "selections.over", odds: over! },
            { outcome: "under", labelKey: "selections.under", odds: under! },
          ],
          line,
        ),
      );
    });

    const [yes, no] = priceFromProbabilities(
      [model.bttsYes, 1 - model.bttsYes],
      1 + MARGIN_SECONDARY,
    );
    drafts.push(
      draft("btts", 20, [
        { outcome: "yes", labelKey: "selections.yes", odds: yes! },
        { outcome: "no", labelKey: "selections.no", odds: no! },
      ]),
    );

    const handicapLine = edge >= 0 ? -1 : 1;
    const shifted = goalModel(
      Math.max(0.2, lambdaHome + handicapLine),
      lambdaAway,
    );
    const [hHome, hAway] = priceFromProbabilities(
      [shifted.home + shifted.draw * 0.5, shifted.away + shifted.draw * 0.5],
      1 + MARGIN_SECONDARY,
    );
    drafts.push(
      draft(
        "handicap",
        30,
        [
          { outcome: "home", label: homeName, odds: hHome! },
          { outcome: "away", label: awayName, odds: hAway! },
        ],
        handicapLine,
      ),
    );

    if (isLive) {
      const [nextHome, nextNone, nextAway] = priceFromProbabilities(
        [lambdaHome, 0.55 * remaining, lambdaAway],
        1 + MARGIN_SECONDARY,
      );
      drafts.push(
        draft("next_goal", 40, [
          { outcome: "home", label: homeName, odds: nextHome! },
          { outcome: "other", labelKey: "selections.no", odds: nextNone! },
          { outcome: "away", label: awayName, odds: nextAway! },
        ]),
      );
    }

    return drafts;
  }

  /* -- points and two-way sports ------------------------------------------- */

  const marginScale = profile.marginScale ?? 20;
  const sd = profile.marginSd ?? 10;
  const expectedMargin = marginScale * (strengthHome - strengthAway) * remaining;
  const homeWinP = normalCdf(expectedMargin / (sd * Math.sqrt(remaining)));

  if (profile.hasDraw) {
    // A narrow band around zero margin stands in for the draw.
    const drawP =
      normalCdf(1.5 / (sd * Math.sqrt(remaining))) -
      normalCdf(-1.5 / (sd * Math.sqrt(remaining)));
    const [oHome, oDraw, oAway] = priceFromProbabilities(
      [homeWinP - drawP / 2, drawP, 1 - homeWinP - drawP / 2],
      1 + MARGIN,
    );
    drafts.push(
      draft("1x2", 1, [
        { outcome: "home", label: homeName, odds: oHome! },
        { outcome: "draw", labelKey: "selections.draw", odds: oDraw! },
        { outcome: "away", label: awayName, odds: oAway! },
      ]),
    );
  } else {
    const key: MarketKey = sportKey === "basketball" ? "moneyline" : "match_winner";
    const [oHome, oAway] = priceFromProbabilities([homeWinP, 1 - homeWinP], 1 + MARGIN);
    drafts.push(
      draft(key, 1, [
        { outcome: "home", label: homeName, odds: oHome! },
        { outcome: "away", label: awayName, odds: oAway! },
      ]),
    );
  }

  if (profile.markets.includes("handicap")) {
    const line = Math.round(expectedMargin * 2) / 2 || 0.5;
    const [hHome, hAway] = priceFromProbabilities([0.5, 0.5], 1 + MARGIN_SECONDARY);
    drafts.push(
      draft(
        "handicap",
        20,
        [
          { outcome: "home", label: homeName, odds: hHome! },
          { outcome: "away", label: awayName, odds: hAway! },
        ],
        -line,
      ),
    );
  }

  if (profile.markets.includes("total_points") && profile.baseTotal) {
    const total = profile.baseTotal + (rng() - 0.5) * (profile.totalSpread ?? 10);
    const line = Math.round(total * 2) / 2;
    const [over, under] = priceFromProbabilities([0.5, 0.5], 1 + MARGIN_SECONDARY);
    drafts.push(
      draft(
        "total_points",
        30,
        [
          { outcome: "over", labelKey: "selections.over", odds: over! },
          { outcome: "under", labelKey: "selections.under", odds: under! },
        ],
        line,
      ),
    );
  }

  return drafts;
}

/* ========================================================================== */
/*  Assembly                                                                  */
/* ========================================================================== */

export function buildFixtures(nowMs: number): FixtureBundle {
  const planned = [
    heroFixture(nowMs),
    ...livePlannedFixtures(nowMs),
    ...planFixtures(nowMs),
  ];

  const events: SportEvent[] = [];
  const markets: Market[] = [];
  const selections: Selection[] = [];

  for (const fixture of planned) {
    const rng = seeded(hashString(fixture.id));
    const profile = PROFILES[fixture.sportKey];
    const elapsedMs = nowMs - fixture.startMs;
    const durationMs = profile.durationMinutes * 60_000 * 1.3;

    let status: SportEvent["status"];
    if (fixture.forcedStatus) {
      status = fixture.forcedStatus;
    } else if (elapsedMs < 0) {
      status = "scheduled";
    } else if (elapsedMs < durationMs) {
      status = "live";
    } else {
      status = "finished";
    }

    // A handful of abandoned fixtures so those states are exercised on screen.
    if (status === "scheduled" && chance(rng, 0.012)) status = "cancelled";
    else if (status === "scheduled" && chance(rng, 0.008)) status = "postponed";

    const isLive = status === "live";
    const completion = isLive
      ? Math.min(0.95, Math.max(0.05, elapsedMs / (profile.durationMinutes * 60_000)))
      : 1;

    const strengthHome = (TEAM_STRENGTH[fixture.homeTeamId] ?? 0.5) + 0.06; // home edge
    const strengthAway = TEAM_STRENGTH[fixture.awayTeamId] ?? 0.5;

    const score =
      isLive || status === "finished"
        ? scoreFor(fixture.sportKey, profile, strengthHome, strengthAway, completion, rng)
        : undefined;

    const live = isLive
      ? liveStateFor(profile, (elapsedMs / 60_000), rng)
      : undefined;

    const eventMarketIds: string[] = [];

    // Settled fixtures keep no live book.
    if (status === "scheduled" || status === "live") {
      // Selection labels are proper nouns shown verbatim in the bet slip, so
      // they must be the club's display name — never its id.
      const drafts = buildMarketDrafts(
        fixture.sportKey,
        TEAM_BY_ID.get(fixture.homeTeamId)?.shortName ?? fixture.homeTeamId,
        TEAM_BY_ID.get(fixture.awayTeamId)?.shortName ?? fixture.awayTeamId,
        strengthHome,
        strengthAway,
        isLive,
        completion,
        rng,
      );

      for (const marketDraft of drafts) {
        const lineSuffix = marketDraft.line === undefined ? "" : `-${marketDraft.line}`;
        const marketId = `market-${fixture.id}-${marketDraft.key}${lineSuffix}`;
        const selectionIds: string[] = [];

        marketDraft.outcomes.forEach((outcome) => {
          const selectionId = `sel-${marketId}-${outcome.outcome}`;
          // ~12% of prices carry a recent move so the odds animation has
          // something real to react to.
          const moved = chance(rng, 0.12);
          const drift = moved ? (chance(rng, 0.5) ? 1 : -1) : 0;
          const previous = moved
            ? clampOdds(outcome.odds * (1 - drift * 0.045))
            : undefined;

          selections.push({
            id: selectionId,
            marketId,
            eventId: fixture.id,
            outcome: outcome.outcome,
            labelKey: outcome.labelKey,
            label: outcome.label,
            odds: outcome.odds,
            previousOdds: previous,
            movement: moved ? (drift > 0 ? "up" : "down") : "none",
            active: marketDraft.status === "open",
          });
          selectionIds.push(selectionId);
        });

        markets.push({
          id: marketId,
          eventId: fixture.id,
          key: marketDraft.key,
          nameKey: marketDraft.nameKey,
          groupKey: marketDraft.groupKey,
          status: marketDraft.status,
          line: marketDraft.line,
          order: marketDraft.order,
          selectionIds,
        });
        eventMarketIds.push(marketId);
      }
    }

    events.push({
      id: fixture.id,
      sportId: fixture.competition.sportId,
      competitionId: fixture.competition.id,
      homeTeamId: fixture.homeTeamId,
      awayTeamId: fixture.awayTeamId,
      startTime: new Date(fixture.startMs).toISOString(),
      status,
      score,
      live,
      featured: fixture.featured ?? false,
      // The board shows a subset; the count is what a full book would carry.
      marketCount:
        status === "scheduled" || status === "live"
          ? eventMarketIds.length + range(rng, 12, fixture.sportKey === "football" ? 110 : 45)
          : 0,
      marketIds: eventMarketIds,
      hasTracker:
        (fixture.sportKey === "football" || fixture.sportKey === "basketball") &&
        chance(rng, 0.6),
    });
  }

  // One featured event per sport, so every sport page has a hero.
  const featuredBySport = new Set<string>([events[0]?.sportId ?? ""]);
  for (const event of events) {
    if (event.featured) continue;
    if (event.status !== "scheduled") continue;
    if (featuredBySport.has(event.sportId)) continue;
    event.featured = true;
    featuredBySport.add(event.sportId);
  }

  events.sort((a, b) => a.startTime.localeCompare(b.startTime));
  return { events, markets, selections };
}
