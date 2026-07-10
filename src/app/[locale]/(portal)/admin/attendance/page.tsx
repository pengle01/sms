import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { ClipboardList, Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { utcMidnight, localDateStr, fmtDisplayDate } from "@/lib/dates";

export default async function AttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string; groupId?: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const { date: dateStr, groupId } = await searchParams;
  const t = await getTranslations("adminAttendance");

  const todayStr = localDateStr();
  const selectedDateStr = dateStr ?? todayStr;
  const today = utcMidnight(todayStr);
  const selectedDate = utcMidnight(selectedDateStr);

  const [groups, absences] = await Promise.all([
    db.group.findMany({ orderBy: [{ grade: "asc" }, { name: "asc" }] }),
    db.attendance.findMany({
      where: {
        date: selectedDate,
        OR: [{ status: "ABSENT" }, { status: "LATE" }, { isAutoAbsent: true }],
        ...(groupId ? { student: { groupId } } : {}),
      },
      include: {
        student: {
          include: {
            user: { select: { name: true } },
            group: true,
          },
        },
        timetableSlot: { include: { course: true } },
        staff: { include: { user: { select: { name: true } } } },
      },
      orderBy: [{ timetableSlot: { period: "asc" } }],
    }),
  ]);

  const isToday = selectedDate.toDateString() === today.toDateString();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
          <p className="text-slate-500 text-sm mt-1">
            {isToday ? t("today") : fmtDisplayDate(selectedDate)}
            {" · "}
            {t("absencesCount", { count: absences.length })}
          </p>
        </div>
        <Link
          href={`/${locale}/admin/attendance/mark`}
          className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
        >
          <ClipboardList className="w-4 h-4" />
          {t("markAttendance")}
        </Link>
      </div>

      {/* Filters */}
      <form method="GET" className="flex gap-3 flex-wrap">
        <input
          type="date"
          name="date"
          defaultValue={selectedDateStr}
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        />
        <select
          name="groupId"
          defaultValue={groupId ?? ""}
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
        >
          <option value="">{t("allGroups")}</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <button type="submit" className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
          {t("apply")}
        </button>
      </form>

      {/* Absence table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("logTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colStudent")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colGroup")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colPeriod")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colCourse")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colStatus")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colDelay")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">SMS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {absences.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3.5 font-medium text-slate-900">{a.student.user?.name}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant="outline" className="text-xs">{a.student.group?.name ?? "—"}</Badge>
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">{a.timetableSlot?.period ?? a.intercalaryPeriod ?? "—"}</td>
                  <td className="px-5 py-3.5 text-slate-600">{a.timetableSlot?.course.name ?? "—"}</td>
                  <td className="px-5 py-3.5">
                    <Badge
                      variant="outline"
                      className={
                        a.status === "ABSENT"
                          ? "bg-red-50 text-red-700 border-red-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }
                    >
                      {a.isAutoAbsent ? t("statusAuto") : a.status === "ABSENT" ? t("statusABSENT") : t("statusLATE")}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500">
                    {a.minutesDelayed > 0 ? t("minutes", { count: a.minutesDelayed }) : "—"}
                  </td>
                  <td className="px-5 py-3.5">
                    {a.smsSent ? (
                      <span className="text-xs text-green-600 font-medium">{t("smsSent")}</span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {absences.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-16 text-center text-slate-400">
                    <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    {t("empty")}
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
