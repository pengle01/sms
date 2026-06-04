import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, Search } from "lucide-react";
import { monthStart, monthEnd, localDateStr, fmtDisplayDate } from "@/lib/dates";
import { termOf } from "@/lib/schoolYear";
import { getSchoolYear } from "@/lib/schoolConfig";
import { getTranslations } from "next-intl/server";
import { matchesSearch, suggestionList } from "@/lib/textSearch";
import { pickQueryString } from "@/lib/listFilters";
import { SuggestInput } from "@/components/SuggestInput";
import { AutoSubmitSelect } from "@/components/AutoSubmitSelect";

export default async function StudentAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string; q?: string; status?: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const { month: monthStr, q, status: statusParam } = await searchParams;
  const query = (q ?? "").trim();
  const status = statusParam === "absent" || statusParam === "late" ? statusParam : undefined;

  const student = await db.studentProfile.findUnique({
    where: { userId: session.user.id },
    include: { group: true },
  });
  if (!student) redirect(`/${locale}/login`);

  const t = await getTranslations("myAttendance");
  const tGrades = await getTranslations("grades");

  const [year, month] = monthStr
    ? monthStr.split("-").map(Number) as [number, number]
    : [parseInt(localDateStr().slice(0, 4)), parseInt(localDateStr().slice(5, 7))];

  const start = monthStart(year, month);
  const end = monthEnd(year, month);

  const records = await db.attendance.findMany({
    where: {
      studentId: student.id,
      date: { gte: start, lt: end },
      OR: [{ status: "ABSENT" }, { status: "LATE" }],
    },
    include: { timetableSlot: { include: { course: true } } },
    orderBy: [{ date: "desc" }, { timetableSlot: { period: "asc" } }],
  });

  // Search + status filter (course names matched accent-insensitively)
  const filtered = records.filter((r) => {
    if (status === "absent" && !(r.status === "ABSENT" || r.isAutoAbsent)) return false;
    if (status === "late" && r.status !== "LATE") return false;
    return matchesSearch(r.timetableSlot?.course.name, query);
  });

  // Autocomplete: courses that actually appear in this month's records
  const suggestions = suggestionList(records.map((r) => r.timetableSlot?.course.name));

  // Summary stats for the month (unfiltered)
  const allRecords = await db.attendance.findMany({
    where: { studentId: student.id, date: { gte: start, lt: end } },
  });
  const absent = allRecords.filter((r) => r.status === "ABSENT" || r.isAutoAbsent).length;
  const late = allRecords.filter((r) => r.status === "LATE").length;

  // Whole-school-year totals, split per term (dates set by the super admin)
  const ranges = await getSchoolYear();
  const yearRecords = await db.attendance.findMany({
    where: { studentId: student.id, date: { gte: ranges.yearStart, lt: ranges.yearEnd } },
    select: { date: true, status: true, isAutoAbsent: true },
  });
  // Year totals count every record in the school year, even between terms.
  const tally = { TERM1: { absent: 0, late: 0 }, TERM2: { absent: 0, late: 0 } };
  const yearTotals = { absent: 0, late: 0 };
  for (const r of yearRecords) {
    const isAbsent = r.status === "ABSENT" || r.isAutoAbsent;
    const isLate = !isAbsent && r.status === "LATE";
    if (isAbsent) yearTotals.absent++;
    else if (isLate) yearTotals.late++;
    const term = termOf(r.date, ranges);
    if (!term) continue;
    if (isAbsent) tally[term].absent++;
    else if (isLate) tally[term].late++;
  }

  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  // Month navigation keeps the active search/status filters
  const monthHref = (y: number, m: number) =>
    pickQueryString(
      { month: `${y}-${String(m).padStart(2, "0")}`, q: query, status },
      ["month", "q", "status"]
    );

  const statusColor = (s: string, isAuto: boolean) => {
    if (isAuto || s === "ABSENT") return "bg-red-50 text-red-700 border-red-200";
    if (s === "LATE") return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  };

  const statusLabel = (r: { status: string; isAutoAbsent: boolean }) => {
    if (r.isAutoAbsent) return t("autoAbsent");
    return r.status === "LATE" ? t("statusLate") : t("statusAbsent");
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
        <p className="text-slate-500 text-sm mt-1">{student.group?.name ?? t("noGroup")}</p>
      </div>

      {/* School-year totals: whole year + per term */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
            {t("yearTitle")}
          </p>
          <div className="grid grid-cols-3 gap-3 text-center divide-x divide-slate-100">
            {[
              { label: t("wholeYear"), data: yearTotals },
              { label: tGrades("term1"), data: tally.TERM1 },
              { label: tGrades("term2"), data: tally.TERM2 },
            ].map((col) => (
              <div key={col.label}>
                <p className="text-xs font-medium text-slate-500">{col.label}</p>
                <p className="mt-1.5">
                  <span className="text-2xl font-bold text-red-600">{col.data.absent}</span>
                  <span className="text-xs text-slate-500 ml-1.5">{t("absences")}</span>
                </p>
                <p className="mt-0.5">
                  <span className="text-base font-bold text-amber-600">{col.data.late}</span>
                  <span className="text-xs text-slate-500 ml-1.5">{t("lateArrivals")}</span>
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Month navigator */}
      <div className="flex items-center gap-3">
        <a
          href={monthHref(prevYear, prevMonth)}
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm hover:bg-slate-50 flex items-center"
        >
          ←
        </a>
        <span className="font-medium text-slate-900">
          {start.toLocaleDateString(locale === "el" ? "el-GR" : "en-GB", { month: "long", year: "numeric" })}
        </span>
        <a
          href={monthHref(nextYear, nextMonth)}
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm hover:bg-slate-50 flex items-center"
        >
          →
        </a>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{absent}</p>
            <p className="text-xs text-slate-500 mt-1">{t("absences")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{late}</p>
            <p className="text-xs text-slate-500 mt-1">{t("lateArrivals")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search within the month */}
      <form method="GET" className="flex gap-2 flex-wrap">
        {monthStr && <input type="hidden" name="month" value={monthStr} />}
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <SuggestInput
            name="q"
            defaultValue={query}
            placeholder={t("searchCourse")}
            suggestions={suggestions}
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
        <AutoSubmitSelect
          name="status"
          defaultValue={status ?? ""}
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        >
          <option value="">{t("statusAll")}</option>
          <option value="absent">{t("statusAbsent")}</option>
          <option value="late">{t("statusLate")}</option>
        </AutoSubmitSelect>
      </form>

      {/* Detail log */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("log")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colDate")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colPeriod")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colCourse")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colStatus")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colDelay")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">
                    {fmtDisplayDate(r.date)}
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">{r.timetableSlot?.period ?? r.intercalaryPeriod ?? "—"}</td>
                  <td className="px-5 py-3.5 font-medium text-slate-900">{r.timetableSlot?.course.name ?? "—"}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant="outline" className={`text-xs ${statusColor(r.status, r.isAutoAbsent)}`}>
                      {statusLabel(r)}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500">
                    {r.minutesDelayed > 0 ? t("minutes", { n: r.minutesDelayed }) : "—"}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center text-slate-400">
                    <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    {query || status ? t("noResults") : t("noAbsences")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
