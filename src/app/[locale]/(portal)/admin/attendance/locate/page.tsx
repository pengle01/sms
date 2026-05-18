import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin } from "lucide-react";
import { utcMidnight } from "@/lib/dates";

export default async function LocatePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ search?: string; groupId?: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const { search, groupId } = await searchParams;

  const today = utcMidnight();

  // Current period based on time (rough estimate — each period 45 min from 08:00)
  const now = new Date();
  const startHour = 8;
  const minutesSinceStart = (now.getHours() - startHour) * 60 + now.getMinutes();
  const currentPeriod = Math.min(7, Math.max(1, Math.ceil(minutesSinceStart / 45)));

  const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon
  const schoolDay = dayOfWeek >= 1 && dayOfWeek <= 5 ? dayOfWeek : 1;

  const [groups, students] = await Promise.all([
    db.group.findMany({ orderBy: [{ grade: "asc" }, { name: "asc" }] }),
    db.studentProfile.findMany({
      where: {
        ...(groupId ? { groupId } : {}),
        ...(search ? { user: { name: { contains: search, mode: "insensitive" } } } : {}),
        user: { isActive: true },
      },
      include: {
        user: { select: { name: true } },
        group: true,
        attendance: {
          where: { date: today },
          include: { timetableSlot: { include: { course: true } } },
          orderBy: { timetableSlot: { period: "desc" } },
          take: 1,
        },
      },
      orderBy: { user: { name: "asc" } },
      take: 100,
    }),
  ]);

  // Also get current timetable slots to show where each group should be
  const currentSlots = await db.timetableSlot.findMany({
    where: { dayOfWeek: schoolDay, period: currentPeriod },
    include: {
      group: true,
      course: true,
      staff: { include: { user: { select: { name: true } } } },
    },
  });

  const slotByGroup = Object.fromEntries(currentSlots.map((s) => [s.groupId, s]));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Student Locator</h2>
        <p className="text-slate-500 text-sm mt-1">
          Period {currentPeriod} · {now.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}
        </p>
      </div>

      {/* Filters */}
      <form method="GET" className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            name="search"
            defaultValue={search}
            placeholder="Search by name…"
            className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          name="groupId"
          defaultValue={groupId ?? ""}
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">All groups</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <button type="submit" className="h-9 px-4 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700">
          Search
        </button>
      </form>

      {/* Current schedule overview (by group) */}
      {!search && !groupId && currentSlots.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Current Period Schedule
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Group</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Course</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Teacher</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Room</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {currentSlots.map((slot) => (
                  <tr key={slot.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Badge variant="outline" className="text-xs">{slot.group.name}</Badge>
                    </td>
                    <td className="px-5 py-3 font-medium text-slate-900">{slot.course.name}</td>
                    <td className="px-5 py-3 text-slate-600">{slot.staff.user.name}</td>
                    <td className="px-5 py-3 text-slate-500">{slot.room ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Student list with current location */}
      {(search || groupId) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Student Locations</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Student</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Group</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Expected Location</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Today&apos;s Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {students.map((s) => {
                  const slot = s.groupId ? slotByGroup[s.groupId] : null;
                  const lastAttendance = s.attendance[0];
                  const isAbsent = lastAttendance?.timetableSlot.period === currentPeriod &&
                    (lastAttendance.status === "ABSENT");
                  return (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-5 py-3.5 font-medium text-slate-900">{s.user.name}</td>
                      <td className="px-5 py-3.5">
                        <Badge variant="outline" className="text-xs">{s.group?.name ?? "—"}</Badge>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">
                        {slot ? (
                          <span>
                            <span className="font-medium">{slot.course.name}</span>
                            {slot.room && <span className="text-slate-400"> · Room {slot.room}</span>}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        {isAbsent ? (
                          <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">Absent</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">Present</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {students.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center text-slate-400">
                      No students found
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
