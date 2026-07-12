import { redirect } from "next/navigation";
import { getActiveAuth } from "@/server/authz";
import { isOfficeAdmin } from "@/lib/rbac";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";

export default async function OfficePortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const auth = await getActiveAuth();

  if (!auth || !isOfficeAdmin(auth.role)) {
    redirect(`/${locale}/login/staff`);
  }

  const { session } = auth;

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar role="SCHOOL_ADMIN" locale={locale} portal="office" userName={session.user?.name ?? undefined} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          userName={session.user?.name ?? undefined}
          userImage={session.user.image ?? undefined}
          locale={locale}
          role="SCHOOL_ADMIN"
          portal="office"
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
