import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getWallet } from "@/services/paymentService";

/**
 * Who the ledger belongs to.
 *
 * The app's demo sign-in cookie carries no per-visitor identity — it is a
 * marker, the same value for everyone — so it cannot key a balance. This mints
 * an opaque per-browser id instead.
 *
 * In a licensed deployment this function returns the authenticated user's id
 * and nothing else changes: every call site already treats it as an opaque
 * ledger key.
 */
export const CASINO_SESSION_COOKIE = "sportgo_casino_session";

export interface CasinoSession {
  sessionId: string;
  /** Set when the id was just minted, so the route can attach the cookie. */
  issued: boolean;
  /** Seeds the ledger the first time this session touches it. */
  openingBalance: number;
}

export async function resolveCasinoSession(): Promise<CasinoSession> {
  const store = await cookies();
  const existing = store.get(CASINO_SESSION_COOKIE)?.value;

  // The opening balance comes from the existing simulated wallet rather than a
  // number invented here, so the casino starts from the same figure the account
  // pages show instead of a second, unrelated balance.
  const wallet = await getWallet();

  if (existing) {
    return { sessionId: existing, issued: false, openingBalance: wallet.balance };
  }

  return { sessionId: randomUUID(), issued: true, openingBalance: wallet.balance };
}

export function sessionCookie(sessionId: string): string {
  return [
    `${CASINO_SESSION_COOKIE}=${sessionId}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    process.env.NODE_ENV === "production" ? "Secure" : "",
    `Max-Age=${60 * 60 * 24}`,
  ]
    .filter(Boolean)
    .join("; ");
}
