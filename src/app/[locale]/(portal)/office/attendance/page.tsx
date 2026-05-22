import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList } from "lucide-react";
import { utcMidnight, localDateStr } from "@/lib/dates";
import { PrintButton } from "./PrintButton";

export default async function OfficeAttendancePage({
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
      orderBy: [{ student: { user: { name: "asc" } } }, { timetableSlot: { period: "asc" } }],
    }),
  ]);

  const isToday = selectedDate.toDateString() === today.toDateString();
  const dateLabel = selectedDate.toLocaleDateString("el-GR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  return (
    <div className="space-y-5">
      {/* Screen header */}
      <div className="flex items-center justify-between flex-wrap gap-3 print:hidden">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Attendance</h2>
          <p className="text-slate-500 text-sm mt-1">
            {isToday ? "Today" : selectedDate.toLocaleDateString("el-GR")}
            {" · "}
            {absences.length} absences / late entries
          </p>
        </div>
        <PrintButton />
      </div>

      {/* Print header — replaces screen header when printing */}
      <div className="hidden print:block mb-4">
        <h1 className="text-xl font-bold">Attendance Report</h1>
        <p className="text-sm text-slate-600">{dateLabel}</p>
        <p className="text-sm text-slate-600">{absences.length} absence{absences.length !== 1 ? "s" : ""} / late entries</p>
      </div>

      {/* Filters — hidden on print */}
      <form method="GET" className="flex gap-3 flex-wrap print:hidden">
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
          <option value="">All groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <button type="submit" className="h-9 px-4 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
          Apply
        </button>
      </form>

      <Card className="print:shadow-none print:border-0">
        <CardHeader className="pb-3 print:hidden">
          <CardTitle className="text-base">Absence &amp; Late Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Student</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Group</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Period</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Course</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Delay</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide print:hidden">SMS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {absences.map((a) => (
                <tr key={a.id} className="hover:bg-slate-50 print:hover:bg-transparent">
                  <td className="px-5 py-3 font-medium text-slate-900">{a.student.user.name}</td>
                  <td className="px-5 py-3">
                    <Badge variant="outline" className="text-xs">{a.student.group?.name ?? "—"}</Badge>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{a.timetableSlot.period}</td>
                  <td className="px-5 py-3 text-slate-600">{a.timetableSlot.course.name}</td>
                  <td className="px-5 py-3">
                    <Badge
                      variant="outline"
                      className={
                        a.status === "ABSENT"
                          ? "bg-red-50 text-red-700 border-red-200"
                          : "bg-amber-50 text-amber-700 border-amber-200"
                      }
                    >
                      {a.isAutoAbsent ? "Auto-Absent" : a.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-slate-500">
                    {a.minutesDelayed > 0 ? `${a.minutesDelayed} min` : "—"}
                  </td>
                  <td className="px-5 py-3 print:hidden">
                    {a.smsSent ? (
                      <span className="text-xs text-green-600 font-medium">Sent</span>
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
                    No absences recorded for this date
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
