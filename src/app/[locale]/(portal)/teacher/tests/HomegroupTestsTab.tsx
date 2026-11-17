import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { db } from "@/server/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDisplayDate } from "@/lib/dates";
import { staffDisplayName } from "@/lib/staffName";
import { studentGroupIds } from "@/lib/studentTests";
import { termOf, type SchoolYearRanges } from "@/lib/schoolYear";
import { averageGrade, gradingStatus } from "@/lib/testReport";
import { GRADE_PASS } from "@/lib/grades";
import { cn } from "@/lib/utils";

type TermFilter = "TERM1" | "TERM2" | "all";

/**
 * «Τμήματα ευθύνης μου» — read-only, for a deputy heading homegroups: every
 * past test the homegroup's students sat (their own group's, electives,
 * labs), with how many of *those* students have a grade and their average.
 * The grades themselves open on the test's grade page, limited to them.
 */
export async function HomegroupTestsTab({
  staffId,
  today,
  year,
  params,
  locale,
}: {
  staffId: string;
  today: Date;
  year: SchoolYearRanges;
  params: { hg?: string; term?: string };
  locale: string;
}) {
  const t = await getTranslations("tests");
  const tGrades = await getTranslations("grades");
  const base = `/${locale}/teacher/tests?tab=homegroups`;

  const homegroups = await db.group.findMany({
    where: { homeroomHeadteacherId: staffId },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  if (homegroups.length === 0) return null;
  const hg = homegroups.find((g) => g.id === params.hg) ?? homegroups[0]!;

  const term: TermFilter =
    params.term === "TERM1" || params.term === "TERM2" || params.term === "all"
      ? params.term
      : (termOf(today, year) ?? "all");
  const dateWhere =
    term === "TERM1"
      ? { gte: year.yearStart, lt: year.term1End, lte: today }
      : term === "TERM2"
        ? { gte: year.term2Start, lt: year.yearEnd, lte: today }
        : { gte: year.yearStart, lte: today };

  const students = await db.studentProfile.findMany({
    where: { groupId: hg.id, user: { isActive: true } },
    select: { id: true, groupId: true, subjectGroups: { select: { groupId: true } } },
  });
  const groupsOf = new Map(
    students.map((s) => [s.id, new Set(studentGroupIds(s.groupId, s.subjectGroups.map((g) => g.groupId)))])
  );
  const allGroupIds = [...new Set([...groupsOf.values()].flatMap((g) => [...g]))];
  const studentIds = students.map((s) => s.id);

  const tests = allGroupIds.length
    ? await db.testSchedule.findMany({
        where: { groupId: { in: allGroupIds }, date: dateWhere },
        include: {
          course: { select: { name: true } },
          group: { select: { name: true } },
          staff: { select: { scheduleName: true, user: { select: { name: true } } } },
          testGrades: {
            where: { studentId: { in: studentIds }, value: { not: null } },
            select: { studentId: true, value: true },
          },
        },
        orderBy: [{ date: "desc" }, { period: "asc" }],
      })
    : [];

  const DOW = t.raw("dow") as string[];
  const link = (q: { hg?: string; term?: string }) =>
    `${base}&hg=${q.hg ?? hg.id}&term=${q.term ?? term}`;

  const chip = (active: boolean) =>
    cn(
      "px-3 py-1 rounded-full border text-sm",
      active ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"
    );

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{t("homegroupsIntro")}</p>

      <div className="flex flex-wrap items-center gap-2">
        {homegroups.length > 1 &&
          homegroups.map((g) => (
            <Link key={g.id} href={link({ hg: g.id })} className={chip(g.id === hg.id)}>
              {g.name}
            </Link>
          ))}
        {homegroups.length > 1 && <span className="w-px h-5 bg-slate-200 mx-1" />}
        {(["TERM1", "TERM2", "all"] as const).map((k) => (
          <Link key={k} href={link({ term: k })} className={chip(term === k)}>
            {k === "all" ? t("termAll") : tGrades(k === "TERM1" ? "term1" : "term2")}
          </Link>
        ))}
      </div>

      {tests.length === 0 ? (
        <p className="text-sm text-slate-400">{t("homegroupsNone", { group: hg.name })}</p>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  <th className="px-5 py-3">{t("colDate")}</th>
                  <th className="px-5 py-3">{t("colSubject")}</th>
                  <th className="px-5 py-3">{t("colTeacher")}</th>
                  <th className="px-5 py-3">{t("colGroup")}</th>
                  <th className="px-5 py-3">{t("colType")}</th>
                  <th className="px-5 py-3">{t("colGrading")}</th>
                  <th className="px-5 py-3">{t("colAverage")}</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {tests.map((test) => {
                  const sitters = studentIds.filter((id) => groupsOf.get(id)?.has(test.groupId));
                  const sitterSet = new Set(sitters);
                  const values = test.testGrades.filter((g) => sitterSet.has(g.studentId)).map((g) => Number(g.value));
                  const st = gradingStatus(values.length, sitters.length, true);
                  const avg = averageGrade(values);
                  return (
                    <tr key={test.id} className="border-b border-slate-50 last:border-0">
                      <td className="px-5 py-3 font-medium text-slate-900 whitespace-nowrap">
                        {DOW[test.date.getUTCDay()]} {fmtDisplayDate(test.date)}
                      </td>
                      <td className="px-5 py-3 text-slate-600">{test.course.name}</td>
                      <td className="px-5 py-3 text-slate-500">{staffDisplayName(test.staff)}</td>
                      <td className="px-5 py-3 text-slate-500">
                        {test.group.name}
                        {test.groupId !== hg.id && (
                          <span className="ml-1 text-xs text-slate-400">({t("someStudents", { count: sitters.length, total: students.length })})</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {test.type === "BIG" ? t("typeBigShort") : t("typeSmallShort")}
                      </td>
                      <td className="px-5 py-3">
                        {st.kind === "none" ? (
                          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">{t("statusNone")}</Badge>
                        ) : st.kind === "partial" ? (
                          <Badge variant="outline" className="text-xs bg-slate-50 text-slate-600 border-slate-200">{t("statusPartial", { graded: st.graded, total: st.total })}</Badge>
                        ) : st.kind === "done" ? (
                          <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">{t("statusDone")}</Badge>
                        ) : null}
                      </td>
                      <td className={cn("px-5 py-3 font-medium", avg == null ? "text-slate-300" : avg < GRADE_PASS ? "text-red-600" : "text-slate-900")}>
                        {avg ?? "—"}
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/${locale}/teacher/tests/${test.id}/grades`}
                          className="text-xs font-medium text-emerald-600 hover:text-emerald-700 whitespace-nowrap"
                        >
                          {t("grades")}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
