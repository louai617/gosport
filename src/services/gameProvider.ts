import type { CasinoGame, GameProvider } from "@/types/games";

/**
 * Game-provider boundary.
 *
 * ── WHY NOTHING IS CONNECTED ──────────────────────────────────────────────
 * Third-party casino content (Pragmatic Play, Evolution, Hacksaw, Spribe and
 * the rest) is not reachable through a public API. Every one of them is a B2B
 * relationship that requires, before a single request is signed:
 *
 *   • an operating licence covering *casino* content — a sports-betting licence
 *     does not extend to it, in Tunisia or in most other markets;
 *   • a commercial agreement with the studio, and usually with an aggregator;
 *   • jurisdiction whitelisting on the provider's side, per game, because game
 *     availability is territory-scoped by their own licence;
 *   • certified RNG and a certified integration, tested by an accredited lab;
 *   • production credentials issued to the licensed entity.
 *
 * None of that can be obtained by writing code, and none of it can be faked.
 * So this module defines the seam precisely and ships a provider that refuses.
 * When a real agreement exists, an adapter implementing `GameProviderAdapter`
 * drops in behind `getGameProvider()` and nothing above it changes.
 * ──────────────────────────────────────────────────────────────────────────
 */

export interface GameLaunchInput {
  gameId: string;
  /** The player's session, exchanged for a provider-side seat token. */
  sessionToken: string;
  currency: string;
  locale: string;
  /** Provider must return a demo-mode URL when true — no wallet is bound. */
  demo: boolean;
  returnUrl: string;
}

export interface GameLaunchResult {
  ok: boolean;
  /**
   * The provider's iframe URL. It is always their origin, never ours: the game
   * runs in their sandbox, and the operator must not proxy or repackage it.
   */
  launchUrl?: string;
  /** Short-lived and single-use, in every sane provider's protocol. */
  seatToken?: string;
  expiresAt?: string;
  errorKey?: string;
  simulated: boolean;
}

/**
 * The wallet callbacks a Remote Gaming Server makes back into the operator.
 *
 * This is the "seamless wallet" pattern: the provider holds no balance, and
 * calls the operator for every debit and credit. Three properties are
 * non-negotiable in a real implementation, and each has a comment because each
 * is a way integrations go wrong in production:
 */
export interface SeamlessWalletCallbacks {
  /**
   * Debit a stake. MUST be idempotent on `roundId` + `transactionId`: providers
   * retry on timeout, and a non-idempotent debit charges the player twice for
   * one spin.
   */
  debit(input: WalletCallbackInput): Promise<WalletCallbackResult>;

  /**
   * Credit a win. Also idempotent, and it must never create the balance out of
   * nothing — the credit is an entry in the same append-only ledger as every
   * other movement, so the wallet stays reconcilable.
   */
  credit(input: WalletCallbackInput): Promise<WalletCallbackResult>;

  /**
   * Roll back a debit for a cancelled round. Must succeed even if the original
   * debit was never received — providers send rollbacks for rounds the
   * operator may have rejected, and answering "unknown transaction" with an
   * error leaves the round stuck open on their side.
   */
  rollback(input: WalletCallbackInput): Promise<WalletCallbackResult>;
}

export interface WalletCallbackInput {
  playerId: string;
  roundId: string;
  /** Provider-side id; the operator's idempotency key. */
  transactionId: string;
  gameId: string;
  amount: number;
  currency: string;
}

export interface WalletCallbackResult {
  ok: boolean;
  balance: number;
  /** Operator-side ledger reference, returned so both sides can reconcile. */
  reference?: string;
  errorKey?: string;
}

export interface GameProviderAdapter {
  readonly id: string;
  readonly name: string;

  /** Titles the provider licenses to this operator, in this territory. */
  listGames(): Promise<CasinoGame[]>;

  /** Exchanges a player session for a launch URL. */
  launch(input: GameLaunchInput): Promise<GameLaunchResult>;

  /**
   * Verifies a wallet callback actually came from the provider. Signature
   * checks are the only thing standing between a public endpoint and a free
   * credit, so an adapter that cannot verify must refuse every callback.
   */
  verifyCallbackSignature(rawBody: string, signature: string): Promise<boolean>;
}

/* ------------------------------------------------------------------ mock */

const NOT_CONNECTED = "games.error.providerNotConnected";

/**
 * The only adapter in this build. It lists nothing and refuses to launch,
 * which is the truthful behaviour for an operator with no agreement, no
 * licence and no credentials.
 */
export const mockGameProvider: GameProviderAdapter = {
  id: "mock",
  name: "Mock provider",

  async listGames() {
    return [];
  },

  async launch() {
    return { ok: false, errorKey: NOT_CONNECTED, simulated: true };
  },

  async verifyCallbackSignature() {
    // Fail closed. An adapter with no shared secret cannot distinguish a
    // provider callback from anyone else's POST.
    return false;
  },
};

/**
 * Resolves the configured adapter.
 *
 * Throws loudly for any value other than `mock`, rather than falling back:
 * a misconfigured provider name silently degrading to a no-op is how a
 * deployment ends up believing it is connected when it is not.
 */
export function getGameProvider(): GameProviderAdapter {
  const configured = process.env.GAME_PROVIDER ?? "mock";
  if (configured !== "mock") {
    throw new Error(
      `GAME_PROVIDER="${configured}" has no adapter in this build. ` +
        "Implement GameProviderAdapter and register it here before setting this.",
    );
  }
  return mockGameProvider;
}

/** Providers described in the catalogue, connected or not. */
export const PROVIDERS: GameProvider[] = [
  {
    id: "provider-sportgo",
    name: "SportGo Originals",
    kind: "in_house",
    status: "connected",
    integration: "native",
    descriptionKey: "games.provider.inHouse.description",
    hue: 224,
  },
  {
    id: "provider-slots",
    name: "Slot studios",
    kind: "third_party",
    status: "not_connected",
    integration: "rgs_iframe",
    descriptionKey: "games.provider.slots.description",
    hue: 286,
  },
  {
    id: "provider-live",
    name: "Live casino studios",
    kind: "third_party",
    status: "not_connected",
    integration: "rgs_iframe",
    descriptionKey: "games.provider.live.description",
    hue: 16,
  },
  {
    id: "provider-table",
    name: "Table game studios",
    kind: "third_party",
    status: "not_connected",
    integration: "rgs_api",
    descriptionKey: "games.provider.table.description",
    hue: 152,
  },
];
