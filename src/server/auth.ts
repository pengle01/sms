import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions, Session } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { passwordLoginDenial, mayPasswordLogin } from "@/lib/authPolicy";
import bcrypt from "bcryptjs";
import { SESSION_COOKIE, USE_SECURE_COOKIES } from "@/lib/sessionCookie";
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
  // Cookie naming lives in one place — see src/lib/sessionCookie.ts for why.
  // The name is pinned explicitly as well as useSecureCookies being set, so
  // getServerSession can never disagree with what the login action wrote.
  useSecureCookies: USE_SECURE_COOKIES,
  cookies: {
    sessionToken: {
      name: SESSION_COOKIE,
      options: { httpOnly: true, sameSite: "lax", path: "/", secure: USE_SECURE_COOKIES },
    },
  },
  pages: {
    // Kept pointing at the staff form: NextAuth's own sign-in/error pages are
    // only reached if an OAuth provider is ever enabled (see below). Families
    // use the custom /login form directly.
    signIn: "/el/login/staff",
    error: "/el/login/staff",
  },
  providers: [
    // Microsoft Entra ID (Azure AD) SSO — DEFERRED, not pending: the Ministry
    // tenant never materialised, the app is hosted on-site, and staff create
    // their own email+password accounts at /register. There is no
    // "Sign in with Microsoft" button anywhere in the UI. Turning this back on
    // is not a matter of uncommenting — see the onboarding design it needs
    // (role for adapter-created users, timetable-name claim over SSO, and
    // OAuthAccountNotLinked for the accounts that already have a password).
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

        // One policy for every role — see passwordLoginDenial for why staff are
        // no longer excluded outside development.
        if (!mayPasswordLogin(user)) {
          logger.warn(
            { event: "auth.loginFailed", method: "credentials", reason: passwordLoginDenial(user) },
            "Login failed",
          );
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
