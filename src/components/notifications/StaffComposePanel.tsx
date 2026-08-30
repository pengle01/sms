import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { EDUCATOR_ROLES } from "@/lib/rbac";
import { canSendStaffNotifications, composeErrorKey } from "@/lib/staffNotifications";
import { specialtyPrefix } from "@/lib/substitutions";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { StaffNotificationForm } from "./StaffNotificationForm";
import { sendStaffNotification } from "./staff-notify-actions";

/**
 * Compose an ad-hoc notification to the teaching staff.
 *
 * Shared by the teacher portal and the office; `hub` is the portal's own
 * notifications page, used for the back link and as the composer's return
 * target. The audience is the same either way — active educators.
 */
export async function StaffComposePanel({
  locale,
  hub,
  sent,
  error,
}: {
  locale: string;
  hub: string;
  sent?: string;
  error?: string;
}) {
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  // Same predicate the action enforces, so the page and the send cannot disagree.
  if (!canSendStaffNotifications(auth.roles)) redirect(hub);

  const t = await getTranslations("staffNotify");
  // Allowlisted, so a hand-edited ?error= cannot throw on the dynamic lookup.
  const errorKey = composeErrorKey(error);

  const educators = await db.user.findMany({
    where: { isActive: true, role: { in: EDUCATOR_ROLES }, id: { not: auth.userId } },
    select: {
      id: true,
      name: true,
      staffProfile: {
        select: {
          scheduleName: true,
          homeroomGroups: { select: { grade: true } },
          homeroomHeadGroups: { select: { grade: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const recipients = educators.map((u) => {
    const homeroomGrades = [
      ...new Set(
        [...(u.staffProfile?.homeroomGroups ?? []), ...(u.staffProfile?.homeroomHeadGroups ?? [])].map(
          (g) => g.grade
        )
      ),
    ].sort();
    return {
      id: u.id,
      label: u.staffProfile?.scheduleName ?? u.name ?? "—",
      sub: u.staffProfile?.scheduleName ? u.name : null,
      // schedule-coding prefix = specialty (ΗΥ, Μ, Φ…) — drives the quick-pick chips
      specialty: u.staffProfile?.scheduleName ? specialtyPrefix(u.staffProfile.scheduleName) : null,
      // which years (Α΄/Β΄/Γ΄) they are homeroom-responsible for
      homeroomGrades,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={hub}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-2"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("backToBoard")}
        </Link>
        <h2 className="text-2xl font-bold text-slate-900">{t("composeTitle")}</h2>
        <p className="text-slate-500 text-sm mt-1">{t("composeSubtitle")}</p>
      </div>

      {sent && (
        <div className="rounded-xl border border-green-200 bg-green-50 px-5 py-3 text-sm text-green-800 max-w-2xl">
          {t("sentBanner", { count: parseInt(sent) })}
        </div>
      )}
      {errorKey && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700 max-w-2xl">
          {t(`err_${errorKey}`)}
        </div>
      )}

      <Card className="max-w-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("newMessage")}</CardTitle>
        </CardHeader>
        <CardContent>
          <StaffNotificationForm recipients={recipients} action={sendStaffNotification.bind(null, locale, `${hub}/compose`)} />
        </CardContent>
      </Card>
    </div>
  );
}
