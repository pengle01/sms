import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { getTranslations } from "next-intl/server";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { loadStudentActivities } from "@/server/studentActivities";
import { StudentActivitiesList } from "@/components/activities/StudentActivitiesList";

/** The student's own activities this school year, upcoming and past. */
export default async function StudentActivitiesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login/student`);
  const student = await db.studentProfile.findUnique({ where: { userId: session.user.id }, select: { id: true } });
  if (!student) redirect(`/${locale}/login/student`);

  const [t, rows] = await Promise.all([getTranslations("studentActivities"), loadStudentActivities(student.id)]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
        <p className="text-slate-500 text-sm mt-1">{t("intro")}</p>
      </div>
      <StudentActivitiesList rows={rows} locale={locale} />
    </div>
  );
}
