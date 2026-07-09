import { redirect } from "next/navigation";
import { getSuperAdminAuth } from "@/server/authz";
import { NotificationsBoard } from "@/components/notifications/NotificationsBoard";

// All of the admin's notifications (unlock requests, system events, …) in one
// place — same board the other portals use.
export default async function AdminNotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const auth = await getSuperAdminAuth();
  if (!auth) redirect(`/${locale}/login`);

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold text-slate-900">Ειδοποιήσεις</h2>
      <NotificationsBoard locale={locale} />
    </div>
  );
}
