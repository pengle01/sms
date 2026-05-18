import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import { isStaff } from "@/lib/rbac";
import type { Role } from "@/generated/prisma";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

export default async function AdminPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user) redirect(`/${locale}/login`);
  if (!isStaff(session.user.role as Role)) redirect(`/${locale}/login`);

  const role = session.user.role as Role;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Desktop sidebar */}
      <Sidebar role={role} locale={locale} portal="admin" userName={session.user.name ?? undefined} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          userName={session.user.name ?? undefined}
          userImage={session.user.image ?? undefined}
          locale={locale}
          role={role}
          portal="admin"
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
