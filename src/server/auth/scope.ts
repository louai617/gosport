import "server-only";

import type { Prisma } from "@prisma/client";

import type { SessionUser } from "@/types/user";

/**
 * Whose players an operator may touch.
 *
 * A superadmin sees every account. A manager sees exactly the players they
 * created (`User.createdById`) and nothing else — not other managers' players,
 * not other managers, not the superadmin. Every service that takes a user id
 * from a request filters through this rather than trusting the id: a manager who
 * guesses another player's id must get "not found", not a read or a write.
 */
export function managedPlayerWhere(actor: SessionUser): Prisma.UserWhereInput {
  if (actor.role === "superadmin") return { role: "PLAYER" };
  if (actor.role === "manager") return { role: "PLAYER", createdById: actor.id };
  // A player (or anything unknown) manages nobody. An impossible predicate.
  return { id: "" };
}

/** Managers are the superadmin's to see; a manager sees no other manager. */
export function managedManagerWhere(actor: SessionUser): Prisma.UserWhereInput {
  return actor.role === "superadmin" ? { role: "MANAGER" } : { id: "" };
}
