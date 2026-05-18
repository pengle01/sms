import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import { getPortalForRole } from "@/lib/rbac";
import type { Role } from "@/generated/prisma";
import { LoginForm } from "./LoginForm";
import { getTranslations } from "next-intl/server";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
  const session = await getServerSession(authOptions);

  if (session?.user) {
    const portal = getPortalForRole(session.user.role as Role);
    redirect(`/${locale}/${portal}`);
  }

  const t = await getTranslations("auth");

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
         style={{ background: "linear-gradient(135deg, #0d1b3e 0%, #1a3a6b 50%, #0d2952 100%)" }}>
      <div className="w-full max-w-4xl">
        {/* Logo / Title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500 shadow-lg shadow-blue-500/30 mb-5">
            <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            {t("login")}
          </h1>
          <p className="text-blue-300/70 mt-2 text-sm">School Management System</p>
        </div>

        <LoginForm
          locale={locale}
          isDev={process.env.NODE_ENV === "development"}
          urlError={error}
        />
      </div>
    </div>
  );
}
