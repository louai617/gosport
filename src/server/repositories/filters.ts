import "server-only";

import type { Prisma } from "@prisma/client";

import { databaseEngine } from "@/server/db";

/**
 * Case-insensitive substring match that works on both engines.
 *
 * PostgreSQL's `contains` is case-sensitive and needs `mode: "insensitive"`;
 * SQLite's `LIKE` is already case-insensitive for ASCII and Prisma rejects the
 * `mode` argument outright. The generated client's types only know `mode` for
 * the engine it was generated for, hence the cast.
 */
export function containsCI(value: string): Prisma.StringFilter {
  const filter: Record<string, unknown> = { contains: value };
  if (databaseEngine() === "postgresql") filter.mode = "insensitive";
  return filter as unknown as Prisma.StringFilter;
}

/** Escapes nothing Prisma already parameterises — but trims and bounds user input. */
export function cleanSearch(value: string | undefined | null, max = 64): string | undefined {
  const trimmed = value?.trim().slice(0, max);
  return trimmed ? trimmed : undefined;
}

export type SortDirection = "asc" | "desc";

export function clampPage(page: number | undefined, pageSize: number | undefined) {
  const size = Math.min(Math.max(Math.trunc(pageSize ?? 20) || 20, 1), 100);
  const current = Math.max(Math.trunc(page ?? 1) || 1, 1);
  return { page: current, pageSize: size, skip: (current - 1) * size, take: size };
}
