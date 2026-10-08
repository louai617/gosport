import { fail, ok, withRoute } from "@/server/api";
import { getManagerDetail } from "@/services/managerService";

/** GET /api/admin/managers/:id */
export const GET = withRoute(
  async ({ params }) => {
    const manager = await getManagerDetail(params.id!);
    return manager ? ok(manager) : fail("not_found", "admin.managers.error.notFound");
  },
  { auth: "admin", permission: "managers.read", rateLimit: "admin" },
);
