import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { authOptions } from "@/server/auth";
import { isAdminStaff } from "@/lib/rbac";
import type { Role } from "@/generated/prisma";
import { db } from "@/server/db";
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
  if (!isAdminStaff(session.user.role as Role)) redirect(`/${locale}/login`);

  const role = session.user.role as Role;
  const headersList = await headers();
  // headersList is used to read x-pathname in other layouts; kept here for parity
  void headersList;

  const pendingClaimsCount = await Promise.all([
    db.user.count({ where: { isActive: false } }),
    db.teacherClaim.count({ where: { status: "PENDING", user: { isActive: true } } }),
    db.chaperoneRequest.count({ where: { status: "PENDING" } }),
  ]).then(([u, t, c]) => u + t + c);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar role={role} locale={locale} portal="admin" userName={session.user.name ?? undefined} pendingClaimsCount={pendingClaimsCount} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          userName={session.user.name ?? undefined}
          userImage={session.user.image ?? undefined}
          locale={locale}
          role={role}
          portal="admin"
          pendingClaimsCount={pendingClaimsCount}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
