import { getEventById } from "@/services/sportsService";
import { fail, ok, withRoute } from "@/server/api";

/** GET /api/events/:id — one fixture with its joined competition and teams. */
export const GET = withRoute(
  async ({ params }) => {
    const event = await getEventById(params.id ?? "");
    if (!event) return fail("not_found", "error.notFound.title", { status: 404 });
    return ok(event);
  },
  { rateLimit: "api" },
);
