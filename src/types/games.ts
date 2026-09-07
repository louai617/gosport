/**
 * Casino games.
 *
 * Two populations live in one catalogue:
 *
 *  - **Originals** — implemented in this repo, provably fair, playable against
 *    the simulated balance.
 *  - **Provider games** — supplied by a third-party studio through a Remote
 *    Gaming Server. None is connected in this build, so all of them are
 *    `unavailable`; the catalogue entry and the adapter exist so the seam is
 *    real rather than hypothetical. See `src/services/gameProvider.ts`.
 */

/** In-house originals. A provider game has no key — the studio owns its math. */
export type GameKey =
  | "slots"
  | "blackjack"
  | "roulette"
  | "dice"
  | "limbo"
  | "crash"
  | "mines"
  | "plinko"
  | "wheel"
  | "keno"
  | "hilo";

export type GameCategory =
  | "originals"
  | "slots"
  | "live_casino"
  | "table_games"
  | "game_shows";

export type GameStatus = "playable" | "coming_soon" | "unavailable";

export type ProviderKind = "in_house" | "third_party";

export type ProviderStatus = "connected" | "not_connected";

export interface GameProvider {
  id: string;
  /** Studio name — a proper noun, rendered as-is. */
  name: string;
  kind: ProviderKind;
  /**
   * `connected` requires a signed commercial agreement, a licence covering the
   * game type, jurisdiction whitelisting and certified RNG. Only the in-house
   * provider is connected here, and only because it is this codebase.
   */
  status: ProviderStatus;
  /** Integration style a real connection would use. */
  integration: "native" | "rgs_iframe" | "rgs_api";
  descriptionKey: string;
  hue: number;
}

export interface CasinoGame {
  id: string;
  slug: string;
  /** Set for originals; absent for provider titles. */
  key?: GameKey;
  providerId: string;
  /** i18n key for originals — their names are ours to translate. */
  nameKey?: string;
  /** Literal title for provider games — a proper noun, never translated. */
  name?: string;
  taglineKey?: string;
  category: GameCategory;
  status: GameStatus;
  /** Fraction, e.g. 0.01. Null when the provider defines its own. */
  houseEdge: number | null;
  /** Theoretical return to player, e.g. 0.99. Null when provider-defined. */
  rtp: number | null;
  /**
   * True when the player's own settings change the return — Plinko's rows and
   * risk each select a different payout table. A single headline figure would
   * then contradict the table actually in front of them, so surfaces show
   * "varies" and defer to the live figure the board publishes.
   */
  rtpVariesByConfig?: boolean;
  minStake: number;
  maxStake: number;
  maxMultiplier: number | null;
  provablyFair: boolean;
  /** Drives the generated artwork; no third-party assets are used. */
  hue: number;
  featured: boolean;
  /** Simulated popularity, used only for ordering the lobby. */
  popularity: number;
  simulated: true;
}

/* ------------------------------------------------------------ fair play */

/**
 * The commitment a player holds before betting.
 *
 * `serverSeed` is deliberately absent: it is secret until rotation, and the
 * type makes that impossible to leak by accident. The revealed seed of the
 * *previous* pair is carried separately so past rounds stay verifiable.
 */
export interface FairSeedState {
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  previous?: {
    serverSeed: string;
    serverSeedHash: string;
    clientSeed: string;
    /** How many rounds were played on the revealed pair. */
    nonce: number;
  };
}

export type RoundOutcome = "won" | "lost" | "cashed_out" | "pushed";

/** One completed round, enough to re-derive and verify it. */
export interface GameRound {
  id: string;
  gameKey: GameKey;
  stake: number;
  /** Payout multiplier actually applied. 0 on a loss. */
  multiplier: number;
  payout: number;
  profit: number;
  outcome: RoundOutcome;
  /** The raw result, shaped per game — a dice roll, a crash point, a path. */
  result: number;
  serverSeedHash: string;
  clientSeed: string;
  nonce: number;
  playedAt: string;
  simulated: true;
}

/* ------------------------------------------------------- per-game config */

export type DiceDirection = "over" | "under";

export interface DiceBet {
  target: number;
  direction: DiceDirection;
}

export type PlinkoRisk = "low" | "medium" | "high";

export interface PlinkoBet {
  rows: number;
  risk: PlinkoRisk;
}

export interface MinesBet {
  mineCount: number;
}

export interface LimboBet {
  targetMultiplier: number;
}

export interface CrashBet {
  /** Auto cash-out target; undefined means the player cashes out by hand. */
  autoCashOut?: number;
}
