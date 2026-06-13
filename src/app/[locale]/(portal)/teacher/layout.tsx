import { redirect } from "next/navigation";
import { getActiveAuth } from "@/server/authz";
import { isEducator } from "@/lib/rbac";
import { canViewSpecialEdFull } from "@/lib/specialEd";
import { db } from "@/server/db";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

export default async function TeacherPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const auth = await getActiveAuth();

  if (!auth || !isEducator(auth.role)) {
    redirect(`/${locale}/login`);
  }

  const { session } = auth;
  const role = auth.role;
  // Teachers with an extra SUPER_ADMIN grant get a link to the admin portal.
  const adminLink = auth.roles.includes("SUPER_ADMIN");
  // Display name follows the timetable's coding (e.g. "ΗΥ-ΜΑΣΙΑ Μ. ΒΔ").
  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: { scheduleName: true, ddkCoordinator: true, specialEducation: true },
  });
  const displayName = staff?.scheduleName ?? session.user?.name ?? undefined;
  // The ΔΔΚ coordinator (a headteacher designation) gets the ΔΔΚ desk in the nav.
  const ddkCoordinator = !!staff?.ddkCoordinator || auth.roles.includes("SUPER_ADMIN");
  // Special-ed desk: counselor / special-ed deputy / headmaster / super-admin.
  const specialEdAccess = canViewSpecialEdFull(auth.roles, !!staff?.specialEducation);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar role={role} locale={locale} portal="teacher" userName={displayName} crossPortal={adminLink ? "admin" : undefined} ddkCoordinator={ddkCoordinator} specialEdAccess={specialEdAccess} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          userName={displayName}
          userImage={session.user.image ?? undefined}
          locale={locale}
          role={role}
          portal="teacher"
          crossPortal={adminLink ? "admin" : undefined}
          ddkCoordinator={ddkCoordinator}
          specialEdAccess={specialEdAccess}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 print:p-0 print:overflow-visible">
          {children}
        </main>
      </div>
    </div>
  );
}
