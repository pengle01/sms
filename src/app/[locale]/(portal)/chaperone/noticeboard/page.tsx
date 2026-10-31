import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getActiveAuth } from "@/server/authz";
import { NotificationsBoard } from "@/components/notifications/NotificationsBoard";

/** «Ειδοποιήσεις» — the chaperone's own notifications, as for parents. */
export default async function ChaperoneNotificationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const auth = await getActiveAuth();
  if (!auth || auth.role !== "CHAPERONE") redirect(`/${locale}/login/staff`);
  const t = await getTranslations("notifications");

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
      <NotificationsBoard locale={locale} />
    </div>
  );
}
