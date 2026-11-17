import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, CalendarCheck } from "lucide-react";
import { utcMidnight, localDateStr, fmtDisplayDate } from "@/lib/dates";
import { getActiveTermInfo, getSchoolYear } from "@/lib/schoolConfig";
import { gradingStatus } from "@/lib/testReport";
import { studentGroupIds } from "@/lib/studentTests";
import { HomegroupTestsTab } from "./HomegroupTestsTab";
import { getTranslations } from "next-intl/server";
import { DeleteTestButton } from "./DeleteTestButton";
import { StudentsTestsTab } from "./StudentsTestsTab";
import { cn } from "@/lib/utils";

export default async function TeacherTestsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; ungraded?: string; hg?: string; term?: string; group?: string; range?: string; type?: string; partial?: string; view?: string; month?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  const tab = sp.tab === "students" ? "students" : sp.tab === "homegroups" ? "homegroups" : "mine";
  const ungradedOnly = sp.ungraded === "1";
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login/staff`);

  const t = await getTranslations("calendar");
  const tTests = await getTranslations("tests");
  const tGrades = await getTranslations("grades");
  const localeTag = locale === "el" ? "el-GR" : "en-US";

  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id } });
  if (!staff) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">{tTests("title")}</h2>
        <p className="text-slate-400 text-sm">{tTests("noStaff")}</p>
      </div>
    );
  }

  const today = utcMidnight(localDateStr());
  const activeTerm = await getActiveTermInfo(today);
  const year = await getSchoolYear();
  // Deputies heading a homegroup get the read-only «Τμήματα ευθύνης μου» tab.
  const headsHomegroups = (await db.group.count({ where: { homeroomHeadteacherId: staff.id } })) > 0;

  const tests = await db.testSchedule.findMany({
    where: {
      staffId: staff.id,
      date: { gte: year.yearStart },
    },
    include: {
      course: { select: { name: true } },
      group: { select: { name: true, grade: true } },
      testGrades: { where: { value: { not: null } }, select: { studentId: true } },
    },
    orderBy: [{ date: "asc" }, { period: "asc" }],
  });

  // How many students sit each test (homegroup + subject-enrolled, active) —
  // one query for all the groups, counted per group.
  const testGroupIds = [...new Set(tests.map((t) => t.groupId))];
  const sitters = testGroupIds.length
    ? await db.studentProfile.findMany({
        where: {
          user: { isActive: true },
          OR: [{ groupId: { in: testGroupIds } }, { subjectGroups: { some: { groupId: { in: testGroupIds } } } }],
        },
        select: { id: true, groupId: true, subjectGroups: { select: { groupId: true } } },
      })
    : [];
  const sittersByGroup = new Map<string, Set<string>>();
  for (const st of sitters) {
    for (const g of studentGroupIds(st.groupId, st.subjectGroups.map((x) => x.groupId))) {
      if (!sittersByGroup.has(g)) sittersByGroup.set(g, new Set());
      sittersByGroup.get(g)!.add(st.id);
    }
  }
  const statusOf = (t: (typeof tests)[number]) => {
    const who = sittersByGroup.get(t.groupId) ?? new Set<string>();
    const graded = t.testGrades.filter((g) => who.has(g.studentId)).length;
    return gradingStatus(graded, who.size, t.date <= today);
  };

  const upcoming = ungradedOnly ? [] : tests.filter((t) => t.date > today);
  const past = tests
    .filter((t) => t.date <= today)
    .filter((t) => !ungradedOnly || statusOf(t).kind !== "done")
    .reverse(); // most recent first

  const DOW = tTests.raw("dow") as string[];

  const formatDate = (d: Date) => `${DOW[d.getUTCDay()]} ${fmtDisplayDate(d)}`;

  const TestRow = ({ t }: { t: (typeof tests)[number] }) => (
    <tr className="border-b border-slate-50 last:border-0">
      <td className="px-5 py-3 text-sm font-medium text-slate-900">
        {formatDate(t.date)}
      </td>
      <td className="px-5 py-3 text-sm text-slate-600">{t.course.name}</td>
      <td className="px-5 py-3 text-sm text-slate-500">{t.group.name}</td>
      <td className="px-5 py-3 text-xs text-slate-400">
        {t.periodCount > 1 ? `P${t.period}–${t.period + t.periodCount - 1}` : `P${t.period}`}
      </td>
      <td className="px-5 py-3">
        <Badge
          variant="outline"
          className={t.type === "BIG"
            ? "text-xs bg-slate-800 text-white border-slate-800"
            : "text-xs bg-slate-100 text-slate-600 border-slate-200"}
        >
          {t.type === "BIG" ? tTests("typeBig") : tTests("typeSmall")}
        </Badge>
      </td>
      <td className="px-5 py-3">
        {(() => {
          const st = statusOf(t);
          if (st.kind === "upcoming") return null;
          if (st.kind === "none") {
            return <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">{tTests("statusNone")}</Badge>;
          }
          if (st.kind === "partial") {
            return <Badge variant="outline" className="text-xs bg-slate-50 text-slate-600 border-slate-200">{tTests("statusPartial", { graded: st.graded, total: st.total })}</Badge>;
          }
          return <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">{tTests("statusDone")}</Badge>;
        })()}
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-3 whitespace-nowrap">
          <Link
            href={`/${locale}/teacher/tests/${t.id}/grades`}
            className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
          >
            {tTests("grades")}
          </Link>
          {t.date <= today && t.testGrades.length > 0 && (
            <Link
              href={`/${locale}/teacher/tests/${t.id}/report`}
              className="text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              {tTests("reportK9")}
            </Link>
          )}
          {t.date >= today && <DeleteTestButton testId={t.id} />}
        </div>
      </td>
    </tr>
  );

  const TestTable = ({ rows, faded }: { rows: typeof tests; faded?: boolean }) => (
    <Card>
      <CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{tTests("colDate")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{tTests("colSubject")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{tTests("colGroup")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{tTests("colPeriod")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{tTests("colType")}</th>
              <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">{tTests("colGrading")}</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className={faded ? "opacity-60" : ""}>
            {rows.map((t) => <TestRow key={t.id} t={t} />)}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{tTests("title")}</h2>
          {activeTerm ? (
            <p className="text-slate-500 text-sm mt-1">
              {t("currentTerm", { label: tGrades(activeTerm.term === "TERM1" ? "term1" : "term2") })}
              {" · "}
              {t("testDeadlineNote", { date: fmtDisplayDate(activeTerm.testDeadline) })}
            </p>
          ) : (
            <p className="text-slate-400 text-sm mt-1">{t("noCurrentTerm")}</p>
          )}
        </div>
        <Link
          href={`/${locale}/teacher/tests/new`}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
        >
          <Plus className="w-4 h-4" />
          {tTests("scheduleTest")}
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200">
        {(headsHomegroups ? (["mine", "students", "homegroups"] as const) : (["mine", "students"] as const)).map((key) => (
          <Link
            key={key}
            href={key === "mine" ? `/${locale}/teacher/tests` : `/${locale}/teacher/tests?tab=${key}`}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px",
              tab === key ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            {key === "mine" ? tTests("tabMine") : key === "students" ? tTests("tabStudents") : tTests("tabHomegroups")}
          </Link>
        ))}
      </div>

      {tab === "students" ? (
        <StudentsTestsTab staffId={staff.id} today={today} params={sp} baseHref={`/${locale}/teacher/tests`} locale={locale} />
      ) : tab === "homegroups" && headsHomegroups ? (
        <HomegroupTestsTab staffId={staff.id} today={today} year={year} params={sp} locale={locale} />
      ) : (
      <>
      <div className="flex gap-2 text-sm">
        <Link
          href={`/${locale}/teacher/tests`}
          className={cn("px-3 py-1 rounded-full border", !ungradedOnly ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50")}
        >
          {tTests("filterAllMine")}
        </Link>
        <Link
          href={`/${locale}/teacher/tests?ungraded=1`}
          className={cn("px-3 py-1 rounded-full border", ungradedOnly ? "bg-slate-800 text-white border-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50")}
        >
          {tTests("filterUngraded")}
        </Link>
      </div>

      {ungradedOnly && past.length === 0 && (
        <p className="text-sm text-slate-400">{tTests("ungradedNone")}</p>
      )}

      {!ungradedOnly && upcoming.length === 0 && past.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          <CalendarCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{tTests("noTests")}</p>
          <p className="text-sm mt-1">{tTests("noTestsHint")}</p>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{tTests("upcoming")}</p>
          <TestTable rows={upcoming} />
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{tTests("pastYear")}</p>
          <TestTable rows={past} faded />
        </div>
      )}
      </>
      )}
    </div>
  );
}
