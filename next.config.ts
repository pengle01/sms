import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Security headers applied to every response. The CSP permits Next.js's inline
// runtime ('unsafe-inline'/'unsafe-eval'); tighten to nonce-based when feasible.
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  // `pino` uses Node built-ins and must be required natively, not bundled, on the
  // server (see src/server/logger.ts).
  serverExternalPackages: ["pino"],
  // DEV ONLY — allowedDevOrigins is consumed exclusively by `next dev` and has no
  // effect on `next build`/`next start`. We additionally gate it on NODE_ENV so a
  // production build never carries the LAN hosts at all.
  // "coding.local" is the machine's stable mDNS name — reachable from a phone on
  // any LAN without knowing the IP. Bookmark http://coding.local:3000 once. The
  // raw IPs are kept as a fallback for devices that can't resolve .local.
  ...(isDev ? { allowedDevOrigins: ["coding.local", "192.168.10.59", "192.168.17.32"] } : {}),
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);
