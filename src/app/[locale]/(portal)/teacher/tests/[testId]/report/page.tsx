import { db } from "@/server/db";
import { redirect, notFound } from "next/navigation";
import { getActiveAuth } from "@/server/authz";
import { getSchoolName, getSchoolYear } from "@/lib/schoolConfig";
import { termOf } from "@/lib/schoolYear";
import { gradeSchoolYear } from "@/lib/grades";
import { gradeBands, testDurationMinutes } from "@/lib/testReport";
import { testStudentsWhere } from "@/server/testStudents";
import { K9Form } from "./K9Form";

// Official Κ9 «ΑΠΟΤΕΛΕΣΜΑΤΑ ΔΙΑΓΩΝΙΣΜΑΤΟΣ» form, filled from the saved
// grades. The test's own teacher only. Absentees come from that period's
// register and can be adjusted on screen before printing (not saved); the
// handwritten fields (announced/unannounced, return date, remarks, delivery
// date, signatures) print blank.
export default async function TestReportPage({
  params,
}: {
  params: Promise<{ locale: string; testId: string }>;
}) {
  const { locale, testId } = await params;
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);

  const staff = await db.staffProfile.findUnique({ where: { userId: auth.userId }, select: { id: true } });
  const test = await db.testSchedule.findUnique({
    where: { id: testId },
    include: {
      course: { select: { name: true } },
      group: { select: { name: true } },
      staff: { select: { scheduleName: true, user: { select: { name: true } } } },
      testGrades: { select: { studentId: true, value: true } },
    },
  });
  if (!test || !staff || test.staffId !== staff.id) notFound();

  const [students, schoolName, year] = await Promise.all([
    db.studentProfile.findMany({
      where: testStudentsWhere(test.groupId),
      select: { id: true, user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    getSchoolName(),
    getSchoolYear(),
  ]);
  const studentIds = students.map((s) => s.id);
  const sitting = new Set(studentIds);

  // Absent (unwaived) in any of the test's periods that day.
  const lastPeriod = test.period + test.periodCount - 1;
  const absentRows = studentIds.length
    ? await db.attendance.findMany({
        where: {
          studentId: { in: studentIds },
          date: test.date,
          status: "ABSENT",
          waived: false,
          OR: [
            { timetableSlot: { period: { gte: test.period, lte: lastPeriod } } },
            { intercalaryPeriod: { gte: test.period, lte: lastPeriod } },
          ],
        },
        select: { studentId: true },
      })
    : [];
  const absentIds = new Set(absentRows.map((a) => a.studentId));

  const bands = gradeBands(
    test.testGrades.filter((g) => sitting.has(g.studentId)).map((g) => (g.value != null ? Number(g.value) : null))
  );
  const term = termOf(test.date, year);
  const dateLabel = test.date.toLocaleDateString("el-GR", {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
  });

  return (
    <K9Form
      backHref={`/${locale}/teacher/tests/${test.id}/grades`}
      schoolName={schoolName}
      schoolYear={gradeSchoolYear(year)}
      teacherName={test.staff.user?.name ?? test.staff.scheduleName ?? ""}
      groupName={test.group.name}
      studentCount={students.length}
      termLabel={term === "TERM1" ? "Α΄" : term === "TERM2" ? "Β΄" : ""}
      courseName={test.course.name}
      dateLabel={dateLabel}
      durationLabel={`${testDurationMinutes(test.type, test.periodCount)}΄`}
      students={students.map((s) => ({ id: s.id, name: s.user?.name ?? "" }))}
      initialAbsentIds={studentIds.filter((id) => absentIds.has(id))}
      bandCounts={bands.counts}
      gradedTotal={bands.total}
    />
  );
}
