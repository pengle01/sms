import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
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
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "TEACHER") {
    redirect(`/${locale}/login`);
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <Sidebar role="TEACHER" locale={locale} portal="teacher" userName={session.user.name ?? undefined} />
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          userName={session.user.name ?? undefined}
          userImage={session.user.image ?? undefined}
          locale={locale}
          role="TEACHER"
          portal="teacher"
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
