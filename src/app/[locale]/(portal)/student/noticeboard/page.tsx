import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { NotificationsBoard } from "@/components/notifications/NotificationsBoard";

export default async function StudentNotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const t = await getTranslations("notifications");

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
      <NotificationsBoard locale={locale} />
    </div>
  );
}
