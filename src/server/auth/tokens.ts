import "server-only";

import { createHmac, randomBytes } from "node:crypto";

import { sessionSecret } from "@/server/env";

/**
 * Opaque bearer tokens — session cookies, password-reset links, invitations.
 *
 * What the database stores is the HMAC of the token under the server secret,
 * never the token. A leaked table is then a list of digests that identify
 * which accounts had a session and let an attacker present nothing. 32 random
 * bytes leave no low-entropy space to pre-compute, so an HMAC (rather than a
 * slow hash) is the right primitive here; it additionally ties every digest to
 * the secret, so a database dump alone cannot even be tested against guesses.
 */
const TOKEN_BYTES = 32;

export function newToken(bytes: number = TOKEN_BYTES): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string): string {
  return createHmac("sha256", sessionSecret()).update(token, "utf8").digest("hex");
}
