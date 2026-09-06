import type {
  AppNotification,
  Bet,
  Competition,
  Country,
  Favorite,
  Market,
  PaymentMethod,
  Promotion,
  ResponsibleGamblingLimit,
  Selection,
  SelfExclusion,
  Sport,
  SportEvent,
  Team,
  Transaction,
  User,
  Wallet,
} from "@/types";

/**
 * The shape of the in-memory demo dataset.
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

  /** The signed-in player used by every account/wallet screen in demo mode. */
  demoUser: User;
  wallet: Wallet;
  bets: Bet[];
  transactions: Transaction[];
  notifications: AppNotification[];
  favorites: Favorite[];
  limits: ResponsibleGamblingLimit[];
  exclusions: SelfExclusion[];

  /** Population used only by the admin dashboard tables. */
  adminUsers: User[];
}
