import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList } from "lucide-react";
import { getNow, monthStart, monthEnd, localDateStr, fmtDisplayDate } from "@/lib/dates";

export default async function StudentAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const { month: monthStr } = await searchParams;

  const student = await db.studentProfile.findUnique({
    where: { userId: session.user.id },
    include: { group: true },
  });
  if (!student) redirect(`/${locale}/login`);

  const now = getNow();
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

  // Summary stats for the month
  const allRecords = await db.attendance.findMany({
    where: { studentId: student.id, date: { gte: start, lt: end } },
  });
  const absent = allRecords.filter((r) => r.status === "ABSENT" || r.isAutoAbsent).length;
  const late = allRecords.filter((r) => r.status === "LATE").length;

  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  const statusColor = (status: string, isAuto: boolean) => {
    if (isAuto || status === "ABSENT") return "bg-red-50 text-red-700 border-red-200";
    if (status === "LATE") return "bg-amber-50 text-amber-700 border-amber-200";
    return "bg-emerald-50 text-emerald-700 border-emerald-200";
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">My Attendance</h2>
        <p className="text-slate-500 text-sm mt-1">{student.group?.name ?? "No group"}</p>
      </div>

      {/* Month navigator */}
      <div className="flex items-center gap-3">
        <a
          href={`?month=${prevYear}-${String(prevMonth).padStart(2, "0")}`}
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm hover:bg-slate-50 flex items-center"
        >
          ←
        </a>
        <span className="font-medium text-slate-900">
          {start.toLocaleDateString("el-GR", { month: "long", year: "numeric" })}
        </span>
        <a
          href={`?month=${nextYear}-${String(nextMonth).padStart(2, "0")}`}
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
            <p className="text-xs text-slate-500 mt-1">Absences</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{late}</p>
            <p className="text-xs text-slate-500 mt-1">Late</p>
          </CardContent>
        </Card>
      </div>

      {/* Detail log */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Absence / Late Log</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Period</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Course</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Status</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Delay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3.5 text-slate-600 whitespace-nowrap">
                    {fmtDisplayDate(r.date)}
                  </td>
                  <td className="px-5 py-3.5 text-slate-600">{r.timetableSlot?.period ?? r.intercalaryPeriod ?? "—"}</td>
                  <td className="px-5 py-3.5 font-medium text-slate-900">{r.timetableSlot?.course.name ?? "—"}</td>
                  <td className="px-5 py-3.5">
                    <Badge variant="outline" className={`text-xs ${statusColor(r.status, r.isAutoAbsent)}`}>
                      {r.isAutoAbsent ? "Auto-Absent" : r.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3.5 text-slate-500">
                    {r.minutesDelayed > 0 ? `${r.minutesDelayed} min` : "—"}
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-16 text-center text-slate-400">
                    <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    No absences this month
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
