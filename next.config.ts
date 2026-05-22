import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.10.59"],
  experimental: {
    // Enable Server Actions (already on by default in Next.js 14+)
  },
};

export default withNextIntl(nextConfig);
