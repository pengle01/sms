import { redirect } from "next/navigation";
import { getActiveAuth } from "@/server/authz";
import { isAdminStaff } from "@/lib/rbac";
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

  if (!auth || !isAdminStaff(auth.role)) redirect(`/${locale}/login`);

  const { session } = auth;
  const role = auth.role;

  const pendingClaimsCount = await Promise.all([
    db.user.count({ where: { isActive: false } }),
    db.teacherClaim.count({ where: { status: "PENDING", user: { isActive: true } } }),
    db.chaperoneRequest.count({ where: { status: "PENDING" } }),
  ]).then(([u, t, c]) => u + t + c);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar role={role} locale={locale} portal="admin" userName={session.user?.name ?? undefined} pendingClaimsCount={pendingClaimsCount} />

      <div className="flex-1 flex flex-col min-w-0">
        <Header
          userName={session.user?.name ?? undefined}
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
