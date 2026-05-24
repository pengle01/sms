import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import { Header } from "@/components/layout/Header";
import { SidebarContent } from "@/components/layout/SidebarContent";

export default async function ParentPortalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.user || session.user.role !== "PARENT") {
    redirect(`/${locale}/login`);
  }

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      <aside className="hidden lg:flex flex-col w-56 flex-shrink-0">
        <SidebarContent
          role="PARENT"
          locale={locale}
          portal="parent"
          userName={session.user?.name ?? undefined}
        />
      </aside>
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          userName={session.user?.name ?? undefined}
          userImage={session.user.image ?? undefined}
          locale={locale}
          role="PARENT"
          portal="parent"
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
