import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { fmtDisplayDate, utcMidnight } from "@/lib/dates";
import { getTranslations } from "next-intl/server";
import { GradeForm } from "./GradeForm";
import { ChevronLeft, Lock, FileText } from "lucide-react";
import { testStudentsWhere } from "@/server/testStudents";
import { testGradeAccess } from "@/lib/testReport";
import { GRADE_PASS } from "@/lib/grades";
import { staffDisplayName } from "@/lib/staffName";
import { cn } from "@/lib/utils";

export default async function TestGradesPage({
  params,
}: {
  params: Promise<{ locale: string; testId: string }>;
}) {
  const { locale, testId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login/staff`);

  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id } });
  if (!staff) redirect(`/${locale}/teacher/tests`);

  const test = await db.testSchedule.findUnique({
    where: { id: testId },
    include: {
      course: true,
      group: true,
      staff: { select: { scheduleName: true, user: { select: { name: true } } } },
      testGrades: { select: { studentId: true, value: true, notes: true } },
    },
  });
  if (!test) notFound();

  const t = await getTranslations("testGrades");
  const tTests = await getTranslations("tests");

  // All students who sit the test (homeroom + subject-enrolled)
  const allStudents = await db.studentProfile.findMany({
    where: testStudentsWhere(test.groupId),
    include: { user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });

  // The owner edits; a deputy heading some of the students' homegroups reads
  // only those students' grades; anyone else gets nothing.
  const headGroups = test.staffId === staff.id
    ? []
    : await db.group.findMany({ where: { homeroomHeadteacherId: staff.id }, select: { id: true } });
  const access = testGradeAccess({
    viewerStaffId: staff.id,
    testStaffId: test.staffId,
    headGroupIds: headGroups.map((g) => g.id),
    students: allStudents.map((s) => ({ id: s.id, groupId: s.groupId })),
  });
  if (access.mode === "none") notFound();
  const visible = access.mode === "deputy" ? new Set(access.studentIds) : null;
  const students = visible ? allStudents.filter((s) => visible.has(s.id)) : allStudents;
  const isOwner = access.mode === "owner";

  const gradeMap = new Map(test.testGrades.map((g) => [g.studentId, g]));

  // No grading before the test has taken place.
  const beforeTestDate = test.date > utcMidnight();

  const DOW = tTests.raw("dow") as string[];
  const dateLabel = `${DOW[test.date.getUTCDay()]} ${fmtDisplayDate(test.date)}`;
  const periodLabel =
    test.periodCount > 1 ? `P${test.period}–${test.period + test.periodCount - 1}` : `P${test.period}`;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={isOwner ? `/${locale}/teacher/tests` : `/${locale}/teacher/tests?tab=homegroups`}
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          {t("back")}
        </Link>
        <div className="flex flex-wrap items-start gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
            <p className="text-slate-500 text-sm mt-1">
              {test.course.name} · {test.group.name} · {dateLabel} · {periodLabel}
              {!isOwner && <> · {staffDisplayName(test.staff)}</>}
            </p>
          </div>
          <Badge
            variant="outline"
            className={
              test.type === "BIG"
                ? "text-xs bg-slate-800 text-white border-slate-800 mt-1"
                : "text-xs bg-slate-100 text-slate-600 border-slate-200 mt-1"
            }
          >
            {test.type === "BIG" ? tTests("typeBig") : tTests("typeSmall")}
          </Badge>
        </div>
      </div>

      {isOwner && !beforeTestDate && test.testGrades.some((g) => g.value != null) && (
        <Link
          href={`/${locale}/teacher/tests/${test.id}/report`}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <FileText className="w-4 h-4" />
          {t("reportK9")}
        </Link>
      )}

      {!isOwner && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
          <Lock className="w-4 h-4 flex-shrink-0 text-slate-400" />
          {t("readOnlyDeputy")}
        </div>
      )}

      {isOwner && beforeTestDate && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
          <Lock className="w-4 h-4 flex-shrink-0 text-slate-400" />
          {t("beforeTestDate")}
        </div>
      )}

      {students.length === 0 ? (
        <p className="text-sm text-slate-400">{t("noStudents")}</p>
      ) : !isOwner ? (
        <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
          <table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                <th className="px-5 py-3">{t("colRegistry")}</th>
                <th className="px-5 py-3">{t("colStudent")}</th>
                <th className="px-5 py-3">{t("colScore")}</th>
              </tr>
            </thead>
            <tbody>
              {students.map((s) => {
                const v = gradeMap.get(s.id)?.value;
                const n = v != null ? Number(v) : null;
                return (
                  <tr key={s.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-5 py-2.5 text-slate-500">{s.studentId}</td>
                    <td className="px-5 py-2.5 text-slate-900">{s.user?.name ?? s.id}</td>
                    <td className={cn("px-5 py-2.5 font-medium", n == null ? "text-slate-400" : n < GRADE_PASS ? "text-red-600" : "text-slate-900")}>
                      {n == null ? t("noGrade") : n}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <GradeForm
          testId={testId}
          locale={locale}
          locked={beforeTestDate}
          students={students.map((s) => {
            const g = gradeMap.get(s.id);
            return {
              id: s.id,
              name: s.user?.name ?? s.id,
              registryNo: s.studentId,
              existingValue: g?.value != null ? String(Number(g.value)) : "",
            };
          })}
          labels={{
            saveAll: t("saveAll"),
            saved: t("saved"),
            colStudent: t("colStudent"),
            colRegistry: t("colRegistry"),
            colScore: t("colScore"),
            invalidGrade: t("invalidGrade"),
          }}
        />
      )}
    </div>
  );
}
