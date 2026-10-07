/**
 * Blackjack — four-deck shoe, dealer stands on soft 17, blackjack pays 3:2.
 *
 * ── ATTRIBUTION ───────────────────────────────────────────────────────────
 * Hand valuation, the shoe, the split/double rules and the settlement table
 * are adapted from casino-by-ai by Lemelson, MIT licensed:
 *   https://github.com/Lemelson/casino-by-ai  (src/scenes/blackjack.js)
 * See THIRD_PARTY_LICENSES.md for the full licence text.
 *
 * Adapted, not copied. The original holds the shoe in a closure inside a canvas
 * scene, shuffles with `Math.random()` and pays a localStorage wallet from the
 * browser. Here the rules are pure functions over a serialisable state, so the
 * shoe lives on the server, the client never sees undealt cards, and a hand can
 * be resumed across requests.
 * ──────────────────────────────────────────────────────────────────────────
 */

export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] as const;
export const SUITS = ["spades", "hearts", "diamonds", "clubs"] as const;

export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];

export interface Card {
  rank: Rank;
  suit: Suit;
}

export const DECKS_IN_SHOE = 4;
/** Reshuffle once the shoe runs low, rather than dealing it to the last card. */
export const SHOE_RESHUFFLE_AT = 20;

export type HandResult = "WIN" | "LOSE" | "PUSH" | "BUST" | "BLACKJACK";

export interface Hand {
  cards: Card[];
  bet: number;
  done: boolean;
  busted: boolean;
  doubled: boolean;
  /** Split aces receive exactly one card and cannot be hit or doubled. */
  splitAces: boolean;
  blackjack: boolean;
  result: HandResult | null;
}

export type BlackjackPhase = "player" | "dealer" | "settled";

export interface BlackjackState {
  shoe: Card[];
  hands: Hand[];
  dealer: Card[];
  /** Index of the hand the player is acting on. */
  active: number;
  /** The dealer's second card stays face down until the player is done. */
  holeHidden: boolean;
  phase: BlackjackPhase;
  totalStaked: number;
  totalReturn: number;
}

export function rankValue(rank: Rank): number {
  if (rank === "A") return 11;
  return ["J", "Q", "K", "10"].includes(rank) ? 10 : Number.parseInt(rank, 10);
}

export interface HandValue {
  total: number;
  /** True when an ace is still counted as 11 — the hand cannot bust on a hit. */
  soft: boolean;
}

/**
 * Aces start at 11 and are demoted one at a time while the hand is over 21.
 * Counting them as 1 up front and promoting instead is the classic way to get
 * soft totals wrong.
 */
export function handValue(cards: Card[]): HandValue {
  let total = 0;
  let aces = 0;

  for (const card of cards) {
    total += rankValue(card.rank);
    if (card.rank === "A") aces += 1;
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return { total, soft: aces > 0 };
}

export function isBlackjack(cards: Card[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

/** A fresh shoe in deal order; the caller shuffles it with its own randomness. */
export function buildShoe(): Card[] {
  const shoe: Card[] = [];
  for (let deck = 0; deck < DECKS_IN_SHOE; deck += 1) {
    for (const suit of SUITS) {
      for (const rank of RANKS) shoe.push({ rank, suit });
    }
  }
  return shoe;
}

/**
 * Fisher–Yates over a caller-supplied float stream.
 *
 * Randomness is injected rather than taken from `Math.random()` so the same
 * function serves the server's CSPRNG and a seeded verification run.
 */
export function shuffleShoe(shoe: Card[], floats: number[]): Card[] {
  const out = [...shoe];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const draw = floats[out.length - 1 - i] ?? 0;
    const j = Math.floor(draw * (i + 1));
    const a = out[i]!;
    const b = out[j]!;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

function newHand(bet: number): Hand {
  return {
    cards: [],
    bet,
    done: false,
    busted: false,
    doubled: false,
    splitAces: false,
    blackjack: false,
    result: null,
  };
}

/** Deals the opening four cards. The shoe is mutated by design — it is state. */
export function dealOpening(shoe: Card[], bet: number): BlackjackState {
  const hand = newHand(bet);
  const dealer: Card[] = [];

  hand.cards.push(shoe.pop()!);
  dealer.push(shoe.pop()!);
  hand.cards.push(shoe.pop()!);
  dealer.push(shoe.pop()!);

  hand.blackjack = isBlackjack(hand.cards);

  const state: BlackjackState = {
    shoe,
    hands: [hand],
    dealer,
    active: 0,
    holeHidden: true,
    phase: "player",
    totalStaked: bet,
    totalReturn: 0,
  };

  // A natural on either side ends the hand immediately — no player decisions.
  if (hand.blackjack || isBlackjack(dealer)) {
    state.holeHidden = false;
    settle(state);
  }

  return state;
}

export function canDouble(state: BlackjackState): boolean {
  const hand = state.hands[state.active];
  return Boolean(
    state.phase === "player" && hand && hand.cards.length === 2 && !hand.splitAces,
  );
}

export function canSplit(state: BlackjackState): boolean {
  const hand = state.hands[state.active];
  if (!hand || state.phase !== "player") return false;
  if (hand.cards.length !== 2 || state.hands.length >= 4) return false;

  // Split on equal *value*, so a K and a Q pair — the common house rule.
  const [first, second] = hand.cards;
  return rankValue(first!.rank) === rankValue(second!.rank);
}

/** Moves to the next unfinished hand, or to the dealer when none remain. */
function advance(state: BlackjackState): void {
  while (state.active < state.hands.length && state.hands[state.active]!.done) {
    state.active += 1;
  }

  if (state.active < state.hands.length) return;

  state.active = state.hands.length - 1;
  state.holeHidden = false;

  // Every hand busted: the dealer does not draw, because there is nothing left
  // to beat and drawing would only leak information about the shoe.
  if (state.hands.every((hand) => hand.busted)) {
    settle(state);
    return;
  }

  state.phase = "dealer";
}

export function hit(state: BlackjackState): BlackjackState {
  const hand = state.hands[state.active];
  if (state.phase !== "player" || !hand || hand.splitAces) return state;

  hand.cards.push(state.shoe.pop()!);
  if (handValue(hand.cards).total > 21) {
    hand.busted = true;
    hand.done = true;
    advance(state);
  }
  return state;
}

export function stand(state: BlackjackState): BlackjackState {
  const hand = state.hands[state.active];
  if (state.phase !== "player" || !hand) return state;

  hand.done = true;
  advance(state);
  return state;
}

/** Doubles the wager, takes exactly one card, and ends the hand. */
export function double(state: BlackjackState): BlackjackState {
  if (!canDouble(state)) return state;

  const hand = state.hands[state.active]!;
  state.totalStaked += hand.bet;
  hand.bet *= 2;
  hand.doubled = true;
  hand.cards.push(state.shoe.pop()!);

  if (handValue(hand.cards).total > 21) hand.busted = true;
  hand.done = true;
  advance(state);
  return state;
}

export function split(state: BlackjackState): BlackjackState {
  if (!canSplit(state)) return state;

  const hand = state.hands[state.active]!;
  const moved = hand.cards.pop()!;
  const wasAces = moved.rank === "A";

  const created = newHand(hand.bet);
  created.cards.push(moved);
  state.totalStaked += hand.bet;

  hand.cards.push(state.shoe.pop()!);
  created.cards.push(state.shoe.pop()!);

  // Split aces get one card each and stand — otherwise splitting aces would be
  // strictly better than any other play.
  if (wasAces) {
    hand.splitAces = true;
    created.splitAces = true;
    hand.done = true;
    created.done = true;
  }

  // A 21 after a split is a normal 21, never a natural.
  hand.blackjack = false;
  created.blackjack = false;

  state.hands.splice(state.active + 1, 0, created);
  if (wasAces) advance(state);
  return state;
}

/** The dealer draws to 17 and stands on soft 17. */
export function playDealer(state: BlackjackState): BlackjackState {
  if (state.phase !== "dealer") return state;

  state.holeHidden = false;
  while (handValue(state.dealer).total < 17) {
    state.dealer.push(state.shoe.pop()!);
  }

  settle(state);
  return state;
}

/**
 * Settlement.
 *
 * `totalReturn` is what goes back to the player: stake plus winnings, because
 * the wager was debited when the hand started. A push returns the stake.
 */
export function settle(state: BlackjackState): BlackjackState {
  const dealerValue = handValue(state.dealer);
  const dealerBlackjack = isBlackjack(state.dealer);
  const dealerBusted = dealerValue.total > 21;

  let payout = 0;

  for (const hand of state.hands) {
    const value = handValue(hand.cards).total;

    if (hand.busted) {
      hand.result = "BUST";
      continue;
    }

    if (hand.blackjack) {
      if (dealerBlackjack) {
        hand.result = "PUSH";
        payout += hand.bet;
      } else {
        hand.result = "BLACKJACK";
        // 3:2 — stake back plus one and a half times the stake. Rounded to the
        // millime, not the whole dinar: stakes are decimal, and rounding to an
        // integer would pay a 1.00 stake 3.00 instead of 2.50.
        payout += Math.round(hand.bet * 2.5 * 1000) / 1000;
      }
      continue;
    }

    if (dealerBlackjack) {
      hand.result = "LOSE";
      continue;
    }

    if (dealerBusted || value > dealerValue.total) {
      hand.result = "WIN";
      payout += hand.bet * 2;
    } else if (value < dealerValue.total) {
      hand.result = "LOSE";
    } else {
      hand.result = "PUSH";
      payout += hand.bet;
    }
  }

  state.totalReturn = payout;
  state.phase = "settled";
  return state;
}

/**
 * What the client is allowed to see.
 *
 * The shoe never crosses the wire — with it, a player could compute every
 * future card. The hole card is withheld until the dealer's turn for the same
 * reason.
 */
export interface BlackjackView {
  hands: Array<Omit<Hand, "cards"> & { cards: Card[]; value: HandValue }>;
  dealer: Card[];
  dealerValue: HandValue | null;
  active: number;
  phase: BlackjackPhase;
  canDouble: boolean;
  canSplit: boolean;
  totalStaked: number;
  totalReturn: number;
  cardsRemaining: number;
}

export function toView(state: BlackjackState): BlackjackView {
  const dealerCards = state.holeHidden ? state.dealer.slice(0, 1) : state.dealer;

  return {
    hands: state.hands.map((hand) => ({ ...hand, value: handValue(hand.cards) })),
    dealer: dealerCards,
    dealerValue: state.holeHidden ? null : handValue(state.dealer),
    active: state.active,
    phase: state.phase,
    canDouble: canDouble(state),
    canSplit: canSplit(state),
    totalStaked: state.totalStaked,
    totalReturn: state.totalReturn,
    cardsRemaining: state.shoe.length,
  };
}
