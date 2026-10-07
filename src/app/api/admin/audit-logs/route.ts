import { auditListQuery } from "@/lib/adminQueries";
import { ok, withRoute } from "@/server/api";
import { listAuditLogs } from "@/services/auditService";

/**
 * GET /api/admin/audit-logs — read-only. There is no POST/PATCH/DELETE on this
 * resource, and the table refuses UPDATE and DELETE at the database level.
 */
export const GET = withRoute(async ({ input }) => ok(await listAuditLogs(input)), {
  schema: auditListQuery,
  auth: "admin",
  permission: "audit.read",
  rateLimit: "admin",
});
