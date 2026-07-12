import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { isManagement, EDUCATOR_ROLES } from "@/lib/rbac";
import { specialtyPrefix } from "@/lib/substitutions";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft } from "lucide-react";
import { ComposeForm } from "./ComposeForm";
import { sendStaffNotification } from "./actions";

export default async function ComposeNotificationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { locale } = await params;
  const { sent, error } = await searchParams;
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  if (!auth.roles.some((r) => isManagement(r))) redirect(`/${locale}/teacher/noticeboard`);

  const t = await getTranslations("staffNotify");

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
          href={`/${locale}/teacher/noticeboard`}
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
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-3 text-sm text-red-700 max-w-2xl">
          {t(`err_${error}`)}
        </div>
      )}

      <Card className="max-w-2xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("newMessage")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ComposeForm recipients={recipients} action={sendStaffNotification.bind(null, locale)} />
        </CardContent>
      </Card>
    </div>
  );
}
