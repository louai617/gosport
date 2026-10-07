import "server-only";

import { isProduction } from "@/server/env";

/**
 * Out-of-band messages that carry a secret: password-reset and invitation links.
 *
 * These cannot go through `notify` — a link that lets someone set a password
 * must reach the owner of an address, not sit in a notifications table.
 *
 * No e-mail or SMS provider is configured in this codebase, so in production
 * `sendSecureLink` reports `delivered: false` and the caller falls back to the
 * administrator-mediated flow (the admin generates a one-time link and hands it
 * over). In development a console transport prints the link so the whole flow
 * can be exercised end to end.
 *
 * To wire a real provider, call `setMessageTransport` once at boot with an
 * object that implements `MessageTransport`.
 */

export type SecureMessageKind = "password_reset" | "invitation";

export interface SecureMessage {
  kind: SecureMessageKind;
  to: { email: string; phone?: string | null };
  link: string;
}

export interface MessageTransport {
  readonly id: string;
  send(message: SecureMessage): Promise<boolean>;
}

const devConsoleTransport: MessageTransport = {
  id: "dev-console",
  async send(message) {
    // Development only. The link is a credential; this transport is never
    // installed when NODE_ENV is "production".
    process.stdout.write(`[dev-transport] ${message.kind} → ${message.to.email}: ${message.link}\n`);
    return true;
  },
};

let transport: MessageTransport | null = isProduction ? null : devConsoleTransport;

export function setMessageTransport(next: MessageTransport | null): void {
  transport = next;
}

export function activeTransportId(): string | null {
  return transport?.id ?? null;
}

export async function sendSecureLink(
  message: SecureMessage,
): Promise<{ delivered: boolean; transport: string | null }> {
  if (!transport) return { delivered: false, transport: null };
  try {
    return { delivered: await transport.send(message), transport: transport.id };
  } catch {
    return { delivered: false, transport: transport.id };
  }
}
