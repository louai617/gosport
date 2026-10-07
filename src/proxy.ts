import { NextResponse, type NextRequest } from "next/server";

/**
 * Edge middleware: Content-Security-Policy and request correlation.
 *
 * The CSP is generated per request because it carries a nonce, and a nonce that
 * is not per-request is not a nonce. `next.config.ts` holds the static headers
 * (HSTS, frame options, referrer policy); anything that has to vary per request
 * has to be here.
 *
 * Runs in the Edge runtime, so this file deliberately imports nothing from
 * `src/server` — no Node built-ins, no zod, no database client. Web Crypto is
 * all it needs.
 */

const NONCE_BYTES = 16;

function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
  return btoa(String.fromCharCode(...bytes));
}

/**
 * `'strict-dynamic'` is the point of the whole policy: it makes the browser
 * trust scripts loaded *by* a nonced script and ignore host allow-lists
 * entirely, so an injected `<script src="//attacker">` is refused even though
 * the attacker controls the markup. Next's own bootstrap is nonced by the
 * framework when it sees the `x-nonce` request header below.
 *
 * `style-src 'unsafe-inline'`: `next/font` and Tailwind's generated critical CSS
 * both emit inline `<style>`, and CSS injection is a far smaller lever than
 * script injection. Removing it would need every inline style hashed at build
 * time — worth doing eventually, not worth a broken page today.
 */
function contentSecurityPolicy(nonce: string, isDevelopment: boolean): string {
  const directives = [
    "default-src 'self'",
    // 'unsafe-eval' exists only for the dev overlay and React Refresh, which
    // compile modules in the browser. It must never reach production.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' https://fonts.gstatic.com",
    // Dev only: HMR runs over a websocket to the same origin.
    `connect-src 'self'${isDevelopment ? " ws: wss:" : ""}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];

  // Upgrading on localhost would rewrite the dev server's own http requests to
  // https and break the page before it renders.
  if (!isDevelopment) directives.push("upgrade-insecure-requests");

  return directives.join("; ");
}

export function proxy(request: NextRequest): NextResponse {
  const isDevelopment = process.env.NODE_ENV !== "production";
  const nonce = createNonce();
  const policy = contentSecurityPolicy(nonce, isDevelopment);

  /**
   * The id is minted here and overwrites anything the client sent, so a caller
   * cannot forge a value that collides with someone else's audit records. It is
   * put on the *request* so route handlers and the audit trail see the same id
   * that comes back on the response.
   */
  const requestId = crypto.randomUUID();

  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  // Lets server layouts know where they are (e.g. to allow the forced
  // password-change page while every other page redirects to it).
  headers.set("x-pathname", request.nextUrl.pathname);
  headers.set("x-request-id", requestId);
  headers.set("content-security-policy", policy);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", policy);
  response.headers.set("x-request-id", requestId);

  return response;
}

export const config = {
  /**
   * Static assets are served straight from the CDN edge and carry no HTML, so
   * a per-request policy on them costs a middleware invocation and buys
   * nothing. Everything that can render markup or run a handler is matched.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)",
  ],
};
