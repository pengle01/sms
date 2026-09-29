import { getActiveAuth } from "@/server/authz";
import { getTranslations } from "next-intl/server";
import { Info } from "lucide-react";
import { db } from "@/server/db";
import { MessagingCenter } from "@/components/messaging/MessagingCenter";

export default async function TeacherMessagesPage() {
  const auth = await getActiveAuth();
  const staff = auth
    ? await db.staffProfile.findUnique({ where: { userId: auth.userId }, select: { parentMessaging: true } })
    : null;
  const t = await getTranslations("messages");

  return (
    <div className="space-y-4">
      {!staff?.parentMessaging && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <Info className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-900">{t("disabledTitle")}</p>
            <p className="text-sm text-amber-800 mt-1">{t("disabledHint")}</p>
          </div>
        </div>
      )}
      <MessagingCenter mode="staff" />
    </div>
  );
}
