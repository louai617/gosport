import { z } from "zod";
import { getNotifications, markAllNotificationsRead } from "@/services/notificationService";
import { ok, withRoute } from "@/server/api";

const querySchema = z.object({
  unreadOnly: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

/** GET /api/notifications — the signed-in user's own notifications. */
export const GET = withRoute(async ({ input }) => ok(await getNotifications(input)), {
  schema: querySchema,
  auth: "user",
  allowPasswordChangePending: true,
  rateLimit: "api",
});

/** POST /api/notifications — marks all of the user's notifications read. */
export const POST = withRoute(
  async () => {
    await markAllNotificationsRead();
    return ok({ read: true });
  },
  { auth: "user", allowPasswordChangePending: true, rateLimit: "api" },
);
