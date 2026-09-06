/**
 * Service layer entry point.
 *
 * Nothing above this line imports `@/data`. A page or component asks a service,
 * the service owns the join and the shape, and replacing the generated demo
 * catalogue with a real feed is a change inside these modules alone.
 *
 * Server-side barrel. `userService`, `paymentService` and `adminService` reach
 * for request-scoped state, so a client component imports the one module it
 * needs — `@/services/oddsService` for the price ticker, say — rather than
 * pulling the whole layer across the boundary.
 */
export * as adminService from "./adminService";
export * as oddsService from "./oddsService";
export * as paymentService from "./paymentService";
export * as promotionsService from "./promotionsService";
export * as sportsService from "./sportsService";
export * as userService from "./userService";

export * from "./types";

/** Contracts declared next to their implementation rather than in `./types`. */
export type { OddsSubscriptionOptions, OddsUpdate } from "./oddsService";
export type { PaymentProviderAdapter } from "./paymentService";
