import { redirect } from "next/navigation";
import Link from "next/link";
import { getActiveAuth } from "@/server/authz";
import { isManagement } from "@/lib/rbac";
import { getTranslations } from "next-intl/server";
import { NotificationsBoard } from "@/components/notifications/NotificationsBoard";
import { PenSquare } from "lucide-react";

export default async function TeacherNotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login`);
  const t = await getTranslations("staffNotify");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-slate-900">Ειδοποιήσεις</h2>
        {/* Management composes ad-hoc messages to teachers */}
        {auth.roles.some((r) => isManagement(r)) && (
          <Link
            href={`/${locale}/teacher/noticeboard/compose`}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
          >
            <PenSquare className="w-4 h-4" />
            {t("newMessage")}
          </Link>
        )}
      </div>
      <NotificationsBoard locale={locale} />
    </div>
  );
}
