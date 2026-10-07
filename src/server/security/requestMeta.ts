import "server-only";

import { headers } from "next/headers";

import { hashIp } from "@/server/security/sanitize";

export interface RequestMeta {
  /** Raw address — for the audit trail only. Sessions and rate limits use `ipHash`. */
  ip: string | null;
  ipHash: string;
  userAgent: string | null;
  requestId: string | null;
}

/**
 * Who is calling, read from the current request.
 *
 * `x-forwarded-for` is set by the platform's edge (Vercel overwrites any
 * client-supplied value), so its first entry is the client address there. On a
 * self-hosted deployment behind a different proxy, make sure the proxy
 * overwrites the header rather than appending to it.
 */
export async function getRequestMeta(): Promise<RequestMeta> {
  try {
    const h = await headers();
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || null;
    return {
      ip,
      ipHash: hashIp(ip),
      userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
      requestId: h.get("x-request-id"),
    };
  } catch {
    return { ip: null, ipHash: hashIp(null), userAgent: null, requestId: null };
  }
}
