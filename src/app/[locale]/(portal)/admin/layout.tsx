import { redirect } from "next/navigation";
import { getActiveAuth } from "@/server/authz";
import { isAdminStaff, isEducator } from "@/lib/rbac";
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
  const auth = await getActiveAuth();

  // Primary SUPER_ADMIN or an admin-granted extra role both unlock the portal.
  if (!auth || !auth.roles.some(isAdminStaff)) redirect(`/${locale}/login`);

  const { session } = auth;
  // Sidebar/nav items are filtered by role — inside the admin portal that is
  // SUPER_ADMIN even when it's only the user's extra role.
  const role: Role = auth.roles.includes("SUPER_ADMIN") ? "SUPER_ADMIN" : auth.role;
  // Educators with an extra admin role get a link back to their own portal.
  const teacherPortalLink = isEducator(auth.role);

  const pendingClaimsCount = await Promise.all([
    db.user.count({ where: { isActive: false } }),
    db.teacherClaim.count({ where: { status: "PENDING", user: { isActive: true } } }),
    db.chaperoneRequest.count({ where: { status: "PENDING" } }),
  ]).then(([u, t, c]) => u + t + c);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar role={role} locale={locale} portal="admin" userName={session.user?.name ?? undefined} pendingClaimsCount={pendingClaimsCount} crossPortal={teacherPortalLink ? "teacher" : undefined} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          userName={session.user?.name ?? undefined}
          userImage={session.user.image ?? undefined}
          locale={locale}
          role={role}
          portal="admin"
          pendingClaimsCount={pendingClaimsCount}
          crossPortal={teacherPortalLink ? "teacher" : undefined}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
