import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { GraduationCap } from "lucide-react";
import { getActiveAuth } from "@/server/authz";
import { db } from "@/server/db";
import { chaperoneStudentIds } from "@/server/guardianAccess";
import { Card, CardContent } from "@/components/ui/card";
import { GuardianStudentCards } from "@/components/guardian/GuardianStudentCards";
import { AnnouncementsCard } from "@/components/announcements/AnnouncementsCard";
import { getAnnouncementsForDay } from "@/server/announcements";
import { utcMidnight } from "@/lib/dates";

/**
 * «Οι μαθητές μου» — the chaperone's home page: today's announcements (as on
 * the staff dashboards), then the students listed under their name on the
 * school's list, with the same cards and pages as a parent's children.
 */
export default async function ChaperoneStudentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const auth = await getActiveAuth();
  if (!auth || auth.role !== "CHAPERONE") redirect(`/${locale}/login/staff`);
  const t = await getTranslations("chaperone");

  const [studentIds, user, announcements] = await Promise.all([
    chaperoneStudentIds(auth.userId),
    db.user.findUnique({ where: { id: auth.userId }, select: { name: true } }),
    getAnnouncementsForDay(utcMidnight()),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("studentsTitle")}</h2>
        <p className="text-slate-500 text-sm mt-1">{t("studentsCount", { count: studentIds.length })}</p>
      </div>

      <AnnouncementsCard announcements={announcements} />

      {studentIds.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center space-y-2">
            <GraduationCap className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-slate-500 text-sm">{t("noStudents", { name: user?.name ?? "—" })}</p>
          </CardContent>
        </Card>
      ) : (
        <GuardianStudentCards locale={locale} studentIds={studentIds} basePath={`/${locale}/chaperone/students`} />
      )}
    </div>
  );
}
