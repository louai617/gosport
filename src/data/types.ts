import type {
  Competition,
  Country,
  Market,
  PaymentMethod,
  Promotion,
  Selection,
  Sport,
  SportEvent,
  Team,
} from "@/types";

/**
 * The shape of the generated sportsbook dataset: sports, fixtures, markets,
 * prices, promotions and payment-method definitions. Player data — accounts,
 * wallets, bets, transactions — is *not* here; it lives in the database.
 *
 * This is the seam between the mock data generator (`src/data/*`) and the
 * service layer (`src/services/*`). Swapping in a real sportsbook feed means
 * replacing the services' internals — nothing above them changes.
 */
export interface MockDataset {
  /** Reference instant the dataset was generated for (ms since epoch). */
  nowMs: number;

  sports: Sport[];
  countries: Country[];
  competitions: Competition[];
  teams: Team[];
  events: SportEvent[];
  markets: Market[];
  selections: Selection[];

  promotions: Promotion[];
  paymentMethods: PaymentMethod[];
}
