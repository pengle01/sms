import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { chaperoneStudentIds } from "@/server/guardianAccess";
import { StudentWeekTimetable } from "@/components/timetable/StudentWeekTimetable";

/**
 * A chaperone's student's timetable this week, with today's changes on top —
 * substitutes, released periods, Φ/δι (Συνοδοί), room changes, homegroup
 * periods, excursions and the student's activities.
 */
export default async function ChaperoneStudentSchedulePage({
  params,
}: {
  params: Promise<{ locale: string; studentId: string }>;
}) {
  const { locale, studentId } = await params;
  const auth = await getActiveAuth();
  if (!auth || auth.role !== "CHAPERONE") redirect(`/${locale}/login/staff`);
  const home = `/${locale}/chaperone/students`;
  if (!(await chaperoneStudentIds(auth.userId)).includes(studentId)) redirect(home);

  const student = await db.studentProfile.findUnique({
    where: { id: studentId },
    include: {
      user: { select: { name: true } },
      group: { select: { name: true } },
      subjectGroups: { select: { groupId: true } },
    },
  });
  if (!student) redirect(home);

  const t = await getTranslations("mySchedule");

  return (
    <div className="space-y-5">
      <div>
        <Link href={home} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" />
          {t("backToStudents")}
        </Link>
        <h2 className="mt-2 text-2xl font-bold text-slate-900">{student.user?.name}</h2>
        <p className="text-slate-500 text-sm mt-1">
          {t("scheduleOf")} · {student.group?.name ?? t("noGroup")}
        </p>
      </div>
      <StudentWeekTimetable
        locale={locale}
        student={{
          id: student.id,
          groupId: student.groupId,
          groupName: student.group?.name ?? null,
          subjectGroupIds: student.subjectGroups.map((sg) => sg.groupId),
        }}
      />
    </div>
  );
}
