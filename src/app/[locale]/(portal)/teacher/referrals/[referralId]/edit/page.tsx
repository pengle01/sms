import { db } from "@/server/db";
import { getPickerGroups } from "@/server/studentPicker";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslations } from "next-intl/server";
import { canEditDraft } from "@/lib/referralStatus";
import { ReferralForm } from "../../new/ReferralForm";

/** Edit a saved draft: the new-referral form with its values; save again or file it. */
export default async function EditDraftReferralPage({
  params,
}: {
  params: Promise<{ locale: string; referralId: string }>;
}) {
  const { locale, referralId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login/staff`);

  const t = await getTranslations("referrals");
  const [staff, claim, referral] = await Promise.all([
    db.staffProfile.findUnique({ where: { userId: session.user.id }, select: { id: true } }),
    db.teacherClaim.findUnique({ where: { userId: session.user.id }, select: { staffName: true } }),
    db.referral.findUnique({ where: { id: referralId }, include: { students: { select: { studentId: true } } } }),
  ]);
  // Only the filer's own draft; a filed referral no longer changes.
  if (!referral || !canEditDraft(referral, staff?.id)) redirect(`/${locale}/teacher/referrals`);

  const filerName = claim?.staffName ?? session.user.name ?? "";
  const groups = await getPickerGroups();

  return (
    <div className="space-y-5 max-w-2xl">
      <Link
        href={`/${locale}/teacher/referrals`}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("title")}
      </Link>

      <h2 className="text-2xl font-bold text-slate-900">{t("editDraft")}</h2>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("editDraft")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ReferralForm
            groups={groups}
            filerName={filerName}
            locale={locale}
            draft={{
              id: referral.id,
              studentIds: referral.students.map((s) => s.studentId),
              title: referral.title ?? "",
              description: referral.description,
              date: referral.date.toISOString().slice(0, 10),
              location: referral.location ?? "",
              incidentTime: referral.incidentTime ?? "",
              extraInfo: referral.extraInfo ?? "",
              recommendations: referral.recommendations,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
