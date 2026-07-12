import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions, Session } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/server/db";
import { rateLimit, resetRateLimit } from "@/server/rateLimit";
import type { Role } from "@/generated/prisma/client";
import { logger } from "@/server/logger";

const IS_DEV = process.env.NODE_ENV === "development";

// Fail fast in production if the JWT signing secret is missing — without it,
// session tokens could be forged.
if (!IS_DEV && !process.env.NEXTAUTH_SECRET) {
  throw new Error("NEXTAUTH_SECRET must be set in production");
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  // Disable secure-cookie prefix in dev so HTTP LAN access (192.168.x.x) works.
  // With AUTH_TRUST_HOST=1 and no x-forwarded-proto, NextAuth infers HTTPS and
  // sets __Secure- cookie prefixes — but browsers drop Secure cookies over HTTP.
  useSecureCookies: process.env.NODE_ENV === "production",
  pages: {
    signIn: "/el/login",
    error: "/el/login",
  },
  providers: [
    // Microsoft Entra ID (Azure AD) SSO — the "Sign in with Microsoft" button on
    // the login page points here. Enable once Azure credentials are configured.
    // Everyone signs in with a password until then (no email-only bypass).
    // AzureADProvider({
    //   clientId: process.env.AZURE_AD_CLIENT_ID!,
    //   clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
    //   tenantId: process.env.AZURE_AD_TENANT_ID!,
    // }),

    // Parents (and all roles in dev fallback) authenticate with email + password
    CredentialsProvider({
      id: "credentials",
      name: "Email & Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) return null;

        const email = credentials.email.toLowerCase();
        // Throttle password attempts per account to slow brute-forcing.
        if (!rateLimit(`login:${email}`, 10, 15 * 60 * 1000)) {
          // No email logged — PII; the rate-limit key already correlates attempts.
          logger.warn({ event: "auth.rateLimited", method: "credentials" }, "Login rate-limited");
          return null;
        }

        const user = await db.user.findUnique({ where: { email } });

        if (!user || !user.passwordHash || !user.isActive) {
          logger.warn({ event: "auth.loginFailed", method: "credentials", reason: "unknown_or_inactive" }, "Login failed");
          return null;
        }
        // Staff authenticate via Entra SSO; students, parents and chaperones use
        // email + password (set up through the access-code activation flow).
        if (!IS_DEV && user.role !== "PARENT" && user.role !== "CHAPERONE" && user.role !== "STUDENT") {
          logger.warn({ event: "auth.loginFailed", method: "credentials", reason: "role_not_allowed", userId: user.id }, "Login failed");
          return null;
        }

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) {
          logger.warn({ event: "auth.loginFailed", method: "credentials", reason: "bad_password", userId: user.id }, "Login failed");
          return null;
        }

        resetRateLimit(`login:${email}`);
        logger.info({ event: "auth.login", method: "credentials", userId: user.id, role: user.role }, "Login succeeded");
        return { id: user.id, email: user.email, name: user.name, role: user.role, image: user.image };
      },
    }),
  ],

  callbacks: {
    // Accept any callback URL that starts with / (relative) or shares the same host+port.
    // This is required when accessing the app from a LAN IP (e.g. mobile on 192.168.x.x)
    // instead of localhost, since NextAuth v4 validates callbackUrl against NEXTAUTH_URL.
    async redirect({ url, baseUrl }) {
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      try {
        const u = new URL(url);
        const b = new URL(baseUrl);
        // Only same-host redirects — never trust a foreign host (open-redirect).
        if (u.host === b.host) return url;
      } catch {}
      return baseUrl;
    },

    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: Role }).role ?? "PARENT";
      }
      return token;
    },

    async session({ session, token }): Promise<Session> {
      return {
        ...session,
        user: {
          ...session.user,
          id: token.id as string,
          role: token.role as Role,
        },
      };
    },
  },
};

// Augment next-auth types
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: Role;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: Role;
    isActive?: boolean;
  }
}
