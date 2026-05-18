import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions, Session } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/server/db";
import type { Role } from "@/generated/prisma";

const IS_DEV = process.env.NODE_ENV === "development";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(db),
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
    // DEV ONLY: log in as any existing staff/student user by email, no password needed.
    // Replaced by AzureADProvider in production.
    ...(IS_DEV
      ? [
          CredentialsProvider({
            id: "azure-ad",
            name: "Microsoft (Dev bypass)",
            credentials: {
              email: { label: "Email", type: "email" },
            },
            async authorize(credentials) {
              console.log("[auth] azure-ad authorize called, email:", credentials?.email);
              if (!credentials?.email) { console.log("[auth] no email"); return null; }
              const user = await db.user.findUnique({
                where: { email: credentials.email.toLowerCase() },
              });
              console.log("[auth] user found:", user?.email, "active:", user?.isActive, "role:", user?.role);
              if (!user || !user.isActive) return null;
              if (user.role === "PARENT") return null;
              return { id: user.id, email: user.email, name: user.name, role: user.role, image: user.image };
            },
          }),
        ]
      : [
          // Uncomment and configure when Azure credentials are ready:
          // AzureADProvider({
          //   clientId: process.env.AZURE_AD_CLIENT_ID!,
          //   clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
          //   tenantId: process.env.AZURE_AD_TENANT_ID!,
          // }),
        ]),

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

        const user = await db.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });

        if (!user || !user.passwordHash || !user.isActive) return null;
        if (!IS_DEV && user.role !== "PARENT") return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

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
        if (u.port === b.port || u.host === b.host) return url;
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
