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
import { getSpecialDaysInRange, isHolidayType } from "@/lib/calendar";
import { byDay, closedDays, monthBounds, monthParam, monthWeeks, parseMonth, shiftMonth } from "@/lib/testCalendar";
import { TestsCalendar, TestsViewToggle, type CalendarEntry } from "@/components/tests/TestsCalendar";

/**
 * «Διαγωνίσματα των μαθητών μου»: every upcoming test that students in the
 * viewer's groups sit — other teachers' and the viewer's own (marked «Δικό
 * μου»), the schedule only, no grades. A test that only some of a group's
 * students sit (an elective) is flagged, with their names. As a list or as a
 * month calendar.
 */
export async function StudentsTestsTab({
  staffId,
  today,
  params,
  baseHref,
  locale,
}: {
  staffId: string;
  today: Date;
  /** The tab's filters, straight from the URL. */
  params: { group?: string; range?: string; type?: string; partial?: string; view?: string; month?: string };
  /** The tab's own address, without filters. */
  baseHref: string;
  locale: string;
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
  const view = params.view === "calendar" ? "calendar" : "list";
  // The list runs from today over the chosen range; the calendar shows one month, past days too.
  const ym = parseMonth(params.month, today);
  const month = monthBounds(ym);
  const until = rangeEnd(today, filters.range);
  const dateWhere = view === "calendar"
    ? { gte: month.from, lte: month.to }
    : { gte: today, ...(until ? { lte: until } : {}) };

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
          date: dateWhere,
          ...(filters.type ? { type: filters.type } : {}),
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
  const filtered =
    filters.groupId !== null || (view === "list" && filters.range !== "all") || filters.type !== null || filters.partialOnly;

  // Links keep the tab, the filters and the view; the calendar keeps its month.
  const href = (o: { view?: "list" | "calendar"; month?: string | null }) => {
    const sp = new URLSearchParams({ tab: "students" });
    if (filters.groupId) sp.set("group", filters.groupId);
    if (filters.range !== "all") sp.set("range", filters.range);
    if (filters.type) sp.set("type", filters.type);
    if (filters.partialOnly) sp.set("partial", "1");
    const v = o.view ?? view;
    if (v === "calendar") {
      sp.set("view", "calendar");
      const m = o.month === undefined ? params.month : o.month;
      if (m) sp.set("month", m);
    }
    return `${baseHref}?${sp.toString()}`;
  };
  const toggle = (
    <TestsViewToggle
      view={view}
      listHref={href({ view: "list" })}
      calendarHref={href({ view: "calendar" })}
      labels={{ list: t("viewList"), calendar: t("viewCalendar") }}
    />
  );

  const DOW = t.raw("dow") as string[];
  const select = "h-9 px-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500";
  const filterBar = (
    <form method="get" action={baseHref} className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3">
      <input type="hidden" name="tab" value="students" />
      {view === "calendar" && <input type="hidden" name="view" value="calendar" />}
      {view === "calendar" && params.month && <input type="hidden" name="month" value={params.month} />}
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
        {t("filterGroup")}
        <select name="group" defaultValue={filters.groupId ?? ""} className={select}>
          <option value="">{t("filterAllGroups")}</option>
          {myGroupIds.map((id) => (
            <option key={id} value={id}>{groupName.get(id)}</option>
          ))}
        </select>
      </label>
      {view === "list" && <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
        {t("filterRange")}
        <select name="range" defaultValue={filters.range} className={select}>
          <option value="week">{t("rangeWeek")}</option>
          <option value="2weeks">{t("range2Weeks")}</option>
          <option value="30days">{t("range30Days")}</option>
          <option value="all">{t("rangeAll")}</option>
        </select>
      </label>}
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
        <Link href={`${baseHref}?tab=students${view === "calendar" ? "&view=calendar" : ""}`} className="h-9 inline-flex items-center text-sm text-slate-500 underline hover:text-slate-800">
          {t("filterClear")}
        </Link>
      )}
    </form>
  );
  const th = "text-left px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide";

  if (myGroupIds.length === 0) {
    return <p className="text-slate-400 text-sm">{t("studentsNoGroups")}</p>;
  }
  if (view === "calendar") {
    const specials = await getSpecialDaysInRange(month.from, month.to);
    const entries = byDay(
      shown.map(({ test, rows }) => ({
        id: test.id,
        date: test.date,
        title: test.course.name,
        sub: test.staffId === staffId ? test.group.name : `${test.group.name} · ${staffDisplayName(test.staff)}`,
        period: test.periodCount > 1 ? `P${test.period}–${test.period + test.periodCount - 1}` : `P${test.period}`,
        type: test.type,
        ...(test.staffId === staffId
          ? { tag: { label: t("mineTag"), tone: "mine" as const } }
          : rows.some((r) => r.partial)
            ? { tag: { label: t("partialTag"), tone: "partial" as const } }
            : {}),
      })) satisfies (CalendarEntry & { date: Date })[],
      (e) => e.date,
    );
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-slate-500">{t("studentsIntro")}</p>
          {toggle}
        </div>
        {filterBar}
        <TestsCalendar
          weeks={monthWeeks(ym)}
          monthLabel={month.from.toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}
          prevHref={href({ month: monthParam(shiftMonth(ym, -1)) })}
          nextHref={href({ month: monthParam(shiftMonth(ym, 1)) })}
          todayIso={today.toISOString().slice(0, 10)}
          closed={closedDays(specials.filter((s) => isHolidayType(s.type)), month.from, month.to)}
          entries={entries}
          dayNames={DOW.slice(1, 6)}
          labels={{ prev: t("calPrev"), next: t("calNext"), holiday: t("calHoliday"), big: t("typeBigShort"), small: t("typeSmallShort") }}
        />
      </div>
    );
  }
  if (shown.length === 0) {
    return (
      <div className="space-y-2">
        <div className="flex justify-end">{toggle}</div>
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
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-slate-500">{t("studentsIntro")}</p>
        {toggle}
      </div>
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
                    <td className="px-4 py-3 text-slate-600">
                      {staffDisplayName(test.staff)}
                      {test.staffId === staffId && (
                        <span className="ml-2 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          {t("mineTag")}
                        </span>
                      )}
                    </td>
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
