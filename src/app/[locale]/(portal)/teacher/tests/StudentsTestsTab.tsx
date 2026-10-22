import { getTranslations } from "next-intl/server";
import { AlertTriangle, CalendarCheck } from "lucide-react";
import { db } from "@/server/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDisplayDate } from "@/lib/dates";
import { staffDisplayName } from "@/lib/staffName";
import Link from "next/link";
import {
  testAudience, audienceGroupIds, parseStudentTestFilters, rangeEnd, filterAudience, type TaughtStudent,
} from "@/lib/studentTests";
import { cn } from "@/lib/utils";

/**
 * «Διαγωνίσματα των μαθητών μου»: other teachers' upcoming tests that students
 * in the viewer's groups sit — the schedule only, no grades. A test that only
 * some of a group's students sit (an elective) is flagged, with their names.
 */
export async function StudentsTestsTab({
  staffId,
  today,
  params,
  baseHref,
}: {
  staffId: string;
  today: Date;
  /** The tab's filters, straight from the URL. */
  params: { group?: string; range?: string; type?: string; partial?: string };
  /** The tab's own address, without filters. */
  baseHref: string;
}) {
  const t = await getTranslations("tests");

  const mySlots = await db.timetableSlot.findMany({
    where: { staffId },
    select: { groupId: true, group: { select: { name: true } } },
  });
  const groupName = new Map(mySlots.map((s) => [s.groupId, s.group.name]));
  const myGroupIds = [...groupName.keys()].sort((a, b) =>
    groupName.get(a)!.localeCompare(groupName.get(b)!, "el")
  );

  const filters = parseStudentTestFilters(params, myGroupIds);
  const until = rangeEnd(today, filters.range);

  const studentRows = myGroupIds.length
    ? await db.studentProfile.findMany({
        where: {
          user: { isActive: true },
          OR: [{ groupId: { in: myGroupIds } }, { subjectGroups: { some: { groupId: { in: myGroupIds } } } }],
        },
        select: {
          id: true,
          groupId: true,
          user: { select: { name: true } },
          subjectGroups: { select: { groupId: true } },
        },
      })
    : [];
  const students: TaughtStudent[] = studentRows.map((s) => ({
    id: s.id,
    groupIds: [...(s.groupId ? [s.groupId] : []), ...s.subjectGroups.map((g) => g.groupId)],
  }));
  const studentName = new Map(studentRows.map((s) => [s.id, s.user?.name ?? ""]));

  const tests = students.length
    ? await db.testSchedule.findMany({
        where: {
          date: { gte: today, ...(until ? { lte: until } : {}) },
          ...(filters.type ? { type: filters.type } : {}),
          staffId: { not: staffId }, // my own tests are on the first tab
          groupId: { in: audienceGroupIds(students) },
        },
        include: {
          course: { select: { name: true } },
          group: { select: { name: true } },
          staff: { select: { scheduleName: true, user: { select: { name: true } } } },
        },
        orderBy: [{ date: "asc" }, { period: "asc" }],
      })
    : [];

  // Each test with the rows of my groups it reaches, narrowed by the filters.
  const shown = tests.flatMap((test) => {
    const rows = filterAudience(testAudience(test.groupId, myGroupIds, students), filters);
    return rows ? [{ test, rows }] : [];
  });
  const filtered = filters.groupId !== null || filters.range !== "all" || filters.type !== null || filters.partialOnly;

  const DOW = t.raw("dow") as string[];
  const select = "h-9 px-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const filterBar = (
    <form method="get" action={baseHref} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <input type="hidden" name="tab" value="students" />
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
        {t("filterGroup")}
        <select name="group" defaultValue={filters.groupId ?? ""} className={select}>
          <option value="">{t("filterAllGroups")}</option>
          {myGroupIds.map((id) => (
            <option key={id} value={id}>{groupName.get(id)}</option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
        {t("filterRange")}
        <select name="range" defaultValue={filters.range} className={select}>
          <option value="week">{t("rangeWeek")}</option>
          <option value="2weeks">{t("range2Weeks")}</option>
          <option value="30days">{t("range30Days")}</option>
          <option value="all">{t("rangeAll")}</option>
        </select>
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
        {t("colType")}
        <select name="type" defaultValue={filters.type ?? ""} className={select}>
          <option value="">{t("filterAllTypes")}</option>
          <option value="BIG">{t("typeBigShort")}</option>
          <option value="SMALL">{t("typeSmallShort")}</option>
        </select>
      </label>
      <label className="flex h-9 items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="partial" value="1" defaultChecked={filters.partialOnly} className="accent-amber-500" />
        {t("filterPartialOnly")}
      </label>
      <button type="submit" className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
        {t("filterApply")}
      </button>
      {filtered && (
        <Link href={`${baseHref}?tab=students`} className="h-9 inline-flex items-center text-sm text-slate-500 underline hover:text-slate-800">
          {t("filterClear")}
        </Link>
      )}
    </form>
  );
  const th = "text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide";

  if (myGroupIds.length === 0) {
    return <p className="text-slate-400 text-sm">{t("studentsNoGroups")}</p>;
  }
  if (shown.length === 0) {
    return (
      <div className="space-y-2">
        {filterBar}
        <div className="text-center py-20 text-slate-400">
          <CalendarCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{filtered ? t("studentsNoneFiltered") : t("studentsNone")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">{t("studentsIntro")}</p>
      {filterBar}
      <p className="text-xs text-slate-500">{t("studentsCount", { count: shown.length })}</p>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className={th}>{t("colDate")}</th>
                <th className={th}>{t("colPeriod")}</th>
                <th className={th}>{t("colSubject")}</th>
                <th className={th}>{t("colTeacher")}</th>
                <th className={th}>{t("colType")}</th>
                <th className={th}>{t("colMyStudents")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {shown.map(({ test, rows }, idx) => {
                const anyPartial = rows.some((r) => r.partial);
                return (
                  <tr key={test.id} className={cn("align-top", idx % 2 === 1 && "bg-slate-50")}>
                    <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">
                      {DOW[test.date.getUTCDay()]} {fmtDisplayDate(test.date)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {test.periodCount > 1 ? `P${test.period}–${test.period + test.periodCount - 1}` : `P${test.period}`}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {test.course.name}
                      <span className="block text-xs text-slate-400">{test.group.name}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{staffDisplayName(test.staff)}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={test.type === "BIG"
                          ? "text-xs bg-slate-800 text-white border-slate-800"
                          : "text-xs bg-slate-100 text-slate-600 border-slate-200"}
                      >
                        {test.type === "BIG" ? t("typeBigShort") : t("typeSmallShort")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 space-y-1">
                      {anyPartial && (
                        <p className="flex items-center gap-1 text-xs font-semibold text-amber-700">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          {t("partialMark")}
                        </p>
                      )}
                      {rows.map((r) =>
                        r.partial ? (
                          <details key={r.groupId} className="text-xs">
                            <summary className="cursor-pointer text-amber-800">
                              <span className="font-medium">{groupName.get(r.groupId)}</span>
                              {" · "}
                              {t("someStudents", { count: r.studentIds.length, total: r.total })}
                            </summary>
                            <ul className="mt-1 ml-4 list-disc text-slate-600">
                              {r.studentIds
                                .map((id) => studentName.get(id) ?? "")
                                .sort((a, b) => a.localeCompare(b, "el"))
                                .map((name, i) => <li key={i}>{name}</li>)}
                            </ul>
                          </details>
                        ) : (
                          <p key={r.groupId} className="text-xs text-slate-600">
                            <span className="font-medium">{groupName.get(r.groupId)}</span>
                            {" · "}
                            {t("wholeGroup")}
                          </p>
                        )
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
