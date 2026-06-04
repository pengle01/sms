import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { fmtDisplayDate, utcMidnight } from "@/lib/dates";
import { getTranslations } from "next-intl/server";
import { GradeForm } from "./GradeForm";
import { ChevronLeft, Lock } from "lucide-react";

export default async function TestGradesPage({
  params,
}: {
  params: Promise<{ locale: string; testId: string }>;
}) {
  const { locale, testId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id } });
  if (!staff) redirect(`/${locale}/teacher/tests`);

  const test = await db.testSchedule.findUnique({
    where: { id: testId },
    include: {
      course: true,
      group: true,
      testGrades: { select: { studentId: true, value: true, notes: true } },
    },
  });
  if (!test || test.staffId !== staff.id) notFound();

  const t = await getTranslations("testGrades");
  const tTests = await getTranslations("tests");

  // All students in the group (homeroom + subject-enrolled)
  const students = await db.studentProfile.findMany({
    where: {
      OR: [
        { groupId: test.groupId },
        { subjectGroups: { some: { groupId: test.groupId } } },
      ],
      user: { isActive: true },
    },
    include: { user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });

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
          href={`/${locale}/teacher/tests`}
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

      {beforeTestDate && (
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
          <Lock className="w-4 h-4 flex-shrink-0 text-slate-400" />
          {t("beforeTestDate")}
        </div>
      )}

      {students.length === 0 ? (
        <p className="text-sm text-slate-400">{t("noStudents")}</p>
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
              existingValue: g?.value != null ? String(Number(g.value)) : "",
            };
          })}
          labels={{
            saveAll: t("saveAll"),
            saved: t("saved"),
            colStudent: t("colStudent"),
            colScore: t("colScore"),
            invalidGrade: t("invalidGrade"),
          }}
        />
      )}
    </div>
  );
}
