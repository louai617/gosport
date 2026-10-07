import { z } from "zod";
import { periodQuerySchema } from "@/lib/adminValidation";
import { withRoute } from "@/server/api";
import { REPORT_KINDS, exportReport } from "@/services/reportService";

const query = periodQuerySchema.extend({ kind: z.enum(REPORT_KINDS as [string, ...string[]]) });

/**
 * GET /api/admin/reports/export?kind=summary|transactions|players&period=…
 *
 * A CSV download. Contains usernames and ids, never e-mails, phone numbers, IP
 * addresses or internal reasons; cells that could execute as spreadsheet
 * formulas are neutralised. The export itself is an audited event.
 */
export const GET = withRoute(
  async ({ input }) => {
    const { kind, ...period } = input;
    const result = await exportReport(kind as "summary", period);
    return new Response(result.csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${result.filename}"`,
        "cache-control": "no-store",
        "x-export-truncated": String(result.truncated),
      },
    });
  },
  { schema: query, auth: "admin", permission: "reports.export", rateLimit: "admin" },
);
