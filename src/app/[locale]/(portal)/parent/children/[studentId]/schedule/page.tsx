import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { db } from "@/server/db";
import { guardianAccess } from "@/server/guardianAccess";
import { StudentWeekTimetable } from "@/components/timetable/StudentWeekTimetable";

/**
 * A child's (or a chaperone's student's) whole timetable this week — every
 * lesson with its teacher (the timetable coding and their specialty) and room
 * — with today's changes on top: substitutes, released periods, Φ/δι, room
 * changes, homegroup periods, excursions and the student's activities.
 * Shared by both portals (the chaperone route re-exports this page).
 */
export default async function GuardianStudentSchedulePage({
  params,
}: {
  params: Promise<{ locale: string; studentId: string }>;
}) {
  const { locale, studentId } = await params;
  const { home, studentIds } = await guardianAccess(locale);
  if (!studentIds.has(studentId)) redirect(home);

  const student = await db.studentProfile.findUnique({
    where: { id: studentId },
    include: {
      user: { select: { name: true } },
      group: { select: { name: true } },
      subjectGroups: { select: { groupId: true } },
    },
  });
  if (!student) redirect(home);

  const [t, tNav] = await Promise.all([getTranslations("mySchedule"), getTranslations("nav")]);
  const isChaperone = home.endsWith("/chaperone/students");

  return (
    <div className="space-y-5">
      <div>
        <Link href={home} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" />
          {isChaperone ? tNav("myStudents") : tNav("children")}
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
