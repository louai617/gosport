import { z } from "zod";
import { getGames } from "@/services/gamesService";
import { ok, withRoute } from "@/server/api";

const CATEGORIES = [
  "originals",
  "slots",
  "live_casino",
  "table_games",
  "game_shows",
] as const;

const STATUSES = ["playable", "coming_soon", "unavailable"] as const;

const querySchema = z.object({
  category: z.enum(CATEGORIES).optional(),
  providerId: z.string().optional(),
  status: z.enum(STATUSES).optional(),
  search: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** GET /api/games — the catalogue, filtered. */
export const GET = withRoute(async ({ input }) => ok(await getGames(input)), {
  schema: querySchema,
  rateLimit: "api",
});
