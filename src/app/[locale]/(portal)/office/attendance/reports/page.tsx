import { db } from "@/server/db";
import { DateInput } from "@/components/ui/date-input";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { localDateStr, getNow } from "@/lib/dates";
import {
  summarizeByStudent,
  summarizeByGroup,
  periodDistribution,
} from "@/lib/attendanceReport";
import { loadReportRows } from "@/server/attendanceReport";
import { Download, BarChart3 } from "lucide-react";

export default async function OfficeAttendanceReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; to?: string; groupId?: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);
  if (!["SCHOOL_ADMIN", "SUPER_ADMIN"].includes(session.user.role)) {
    redirect(`/${locale}/login`);
  }

  const t = await getTranslations("officeReports");
  const { from, to, groupId } = await searchParams;

  // Default range: the last 30 days
  const todayStr = localDateStr();
  const defaultFrom = localDateStr(new Date(getNow().getTime() - 30 * 24 * 60 * 60 * 1000));
  const fromStr = from ?? defaultFrom;
  const toStr = to ?? todayStr;

  const [groups, rows] = await Promise.all([
    db.group.findMany({
      where: { students: { some: {} } },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
      select: { id: true, name: true },
    }),
    loadReportRows(fromStr, toStr, groupId || undefined),
  ]);

  const byStudent = summarizeByStudent(rows);
  const byGroup = summarizeByGroup(rows);
  const distribution = periodDistribution(rows);
  const maxDistCount = Math.max(1, ...distribution.map((d) => d.count));

  const totals = {
    absences: rows.filter((r) => r.status === "ABSENT").length,
    late: rows.filter((r) => r.status === "LATE").length,
    students: new Set(rows.map((r) => r.studentProfileId)).size,
    withPermit: rows.filter((r) => r.hasExitPermit).length,
  };

  const qs = new URLSearchParams({ from: fromStr, to: toStr, ...(groupId ? { groupId } : {}) });
  const selectedGroup = groupId ? groups.find((g) => g.id === groupId) ?? null : null;

  const tile = (label: string, value: number, accent = "text-slate-900") => (
    <Card>
      <CardContent className="py-4 px-5">
        <p className={`text-2xl font-bold ${accent}`}>{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );

  const th = (label: string, right = true) => (
    <th className={`px-4 py-2.5 text-xs font-semibold text-slate-500 ${right ? "text-right" : "text-left"}`}>
      {label}
    </th>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-600" />
            {t("title")}
          </h2>
          <p className="text-slate-500 text-sm mt-1">{t("subtitle")}</p>
        </div>
        <a
          href={`/${locale}/office/attendance/reports/export?${qs.toString()}`}
          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
        >
          <Download className="w-4 h-4" />
          {t("exportCsv")}
        </a>
      </div>

      {/* Filters */}
      <form method="GET" className="flex gap-3 flex-wrap items-end">
        <label className="text-xs text-slate-500">
          {t("from")}
          <DateInput
            name="from"
            defaultValue={fromStr}
            max={todayStr}
            className="block mt-1 h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </label>
        <label className="text-xs text-slate-500">
          {t("to")}
          <DateInput
            name="to"
            defaultValue={toStr}
            max={todayStr}
            className="block mt-1 h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </label>
        <label className="text-xs text-slate-500">
          {t("group")}
          <select
            name="groupId"
            defaultValue={groupId ?? ""}
            className="block mt-1 h-9 px-3 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="">{t("allGroups")}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="h-9 px-4 rounded-lg bg-slate-800 text-white text-sm font-medium hover:bg-slate-700"
        >
          {t("apply")}
        </button>
      </form>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tile(t("totalAbsences"), totals.absences, "text-red-600")}
        {tile(t("totalLate"), totals.late, "text-amber-600")}
        {tile(t("studentsAffected"), totals.students)}
        {tile(t("withPermit"), totals.withPermit, "text-yellow-600")}
      </div>

      {/* Per-period distribution */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("byPeriod")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2 sm:gap-4">
            {distribution.map((d) => (
              <div key={d.period} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs font-semibold text-slate-600">{d.count}</span>
                <div
                  className="w-full max-w-10 rounded-t bg-emerald-500/80"
                  style={{ height: `${Math.round((d.count / maxDistCount) * 72) + 2}px` }}
                />
                <span className="text-[11px] text-slate-400">Π{d.period}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* All groups → per-group summary; specific group → per-student detail */}
      {!selectedGroup ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("byGroup")}</CardTitle>
            <p className="text-xs text-slate-400">{t("byGroupHint")}</p>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100">
                <tr>
                  {th(t("colGroup"), false)}
                  {th(t("colStudents"))}
                  {th(t("colAbsences"))}
                  {th(t("colLate"))}
                  {th(t("colExcused"))}
                  {th(t("colPermit"))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {byGroup.map((g) => (
                  <tr key={g.groupId ?? "none"} className="hover:bg-emerald-50/30">
                    <td className="px-4 py-2.5">
                      {g.groupId ? (
                        <Link
                          href={`?${new URLSearchParams({ from: fromStr, to: toStr, groupId: g.groupId }).toString()}`}
                          className="font-medium text-emerald-700 hover:underline"
                        >
                          {g.groupName}
                        </Link>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">{g.students}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-red-600">{g.absences}</td>
                    <td className="px-4 py-2.5 text-right text-amber-600">{g.late}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{g.excused}</td>
                    <td className="px-4 py-2.5 text-right text-yellow-600">{g.withPermit}</td>
                  </tr>
                ))}
                {byGroup.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-400">
                      {t("noData")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {t("byStudent", { group: selectedGroup.name })}
            </CardTitle>
            <p className="text-xs text-slate-400">{t("byStudentHint")}</p>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100">
                <tr>
                  {th(t("colStudent"), false)}
                  {th(t("colId"), false)}
                  {th(t("colDays"))}
                  {th(t("colAbsences"))}
                  {th(t("colAuto"))}
                  {th(t("colLate"))}
                  {th(t("colExcused"))}
                  {th(t("colPermit"))}
                  {th(t("colWaived"))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {byStudent.map((s) => (
                  <tr key={s.studentProfileId} className="hover:bg-emerald-50/30">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{s.studentName}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-400">{s.studentId}</td>
                    <td className="px-4 py-2.5 text-right">{s.days}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-red-600">{s.absences}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{s.autoAbsent}</td>
                    <td className="px-4 py-2.5 text-right text-amber-600">{s.late}</td>
                    <td className="px-4 py-2.5 text-right text-slate-500">{s.excused}</td>
                    <td className="px-4 py-2.5 text-right text-yellow-600">{s.withPermit}</td>
                    <td className="px-4 py-2.5 text-right text-slate-400">{s.waived}</td>
                  </tr>
                ))}
                {byStudent.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-6 text-center text-sm text-slate-400">
                      {t("noData")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
