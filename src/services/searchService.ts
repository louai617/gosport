import "server-only";

import { fromBig } from "@/lib/money";
import { prisma } from "@/server/db";
import { requirePermission } from "@/server/auth/guard";
import { managedPlayerWhere } from "@/server/auth/scope";
import { cleanSearch, containsCI } from "@/server/repositories/filters";

/**
 * Operator-wide search: players by id, username, e-mail or phone; ledger entries
 * by reference or id; tickets by reference. Gated by `search.use`, and each
 * block additionally requires the permission to read what it returns — a role
 * allowed to search but not to read transactions gets no transaction hits.
 */

export interface AdminSearchResult {
  kind: "player" | "transaction" | "bet";
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export async function searchAdmin(raw: string): Promise<AdminSearchResult[]> {
  const actor = await requirePermission("search.use");
  const query = cleanSearch(raw);
  if (!query || query.length < 2) return [];

  const { can } = await import("@/server/auth/permissions");
  const results: AdminSearchResult[] = [];

  if (can(actor.role, "players.read")) {
    const players = await prisma.user.findMany({
      where: {
        ...managedPlayerWhere(actor),
        OR: [
          { id: query },
          { username: containsCI(query) },
          { profile: { displayName: containsCI(query) } },
        ],
      },
      select: { id: true, username: true, status: true, createdBy: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    });
    for (const player of players) {
      results.push({
        kind: "player",
        id: player.id,
        title: player.username,
        subtitle: `${player.status.toLowerCase()}${player.createdBy ? ` · ${player.createdBy.username}` : ""}`,
        href: `/admin/players/${player.id}`,
      });
    }
  }

  if (can(actor.role, "transactions.read")) {
    const rows = await prisma.transaction.findMany({
      where: { OR: [{ id: query }, { reference: containsCI(query) }] },
      include: { user: { select: { username: true } } },
      orderBy: { createdAt: "desc" },
      take: 6,
    });
    for (const row of rows) {
      results.push({
        kind: "transaction",
        id: row.id,
        title: row.reference,
        subtitle: `${row.type} · ${(fromBig(row.amount) / 1000).toFixed(2)} · ${row.user.username}`,
        href: `/admin/transactions?search=${encodeURIComponent(row.reference)}`,
      });
    }
  }

  if (can(actor.role, "bets.read")) {
    const bets = await prisma.bet.findMany({
      where: { OR: [{ id: query }, { reference: containsCI(query) }] },
      include: { user: { select: { username: true } } },
      orderBy: { placedAt: "desc" },
      take: 4,
    });
    for (const bet of bets) {
      results.push({
        kind: "bet",
        id: bet.id,
        title: bet.reference,
        subtitle: `${bet.kind.toLowerCase()} · ${bet.status.toLowerCase()} · ${bet.user.username}`,
        href: `/admin/bets?search=${encodeURIComponent(bet.reference)}`,
      });
    }
  }

  return results;
}
