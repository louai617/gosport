import type { NextConfig } from "next";

/**
 * SportGo — Next.js configuration.
 *
 * Security headers are defined here as a baseline. Before any production /
 * regulated launch these must be reviewed together with the CSP required by the
 * (future) payment provider, KYC provider and analytics vendors.
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Native / driver packages are loaded by Node at runtime, not bundled. The
  // Prisma driver adapters are required lazily (src/server/db.ts) so a
  // PostgreSQL deployment never loads the libsql binding and vice versa.
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-libsql",
    "@prisma/adapter-pg",
    "@libsql/client",
    "pg",
    "@node-rs/argon2",
  ],
  images: {
    formats: ["image/avif", "image/webp"],
  },
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
