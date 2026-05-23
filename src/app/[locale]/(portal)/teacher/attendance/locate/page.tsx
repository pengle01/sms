import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { utcMidnight } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronDown, CalendarRange, ExternalLink } from "lucide-react";

const PERIODS = [1, 2, 3, 4, 5, 6, 7];

export default async function TeacherLocatePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ groupId?: string; grade?: string; expand?: string; _t?: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const { groupId, grade, expand, _t } = await searchParams;

  // Dev-only time override: ?_t=2026-05-22T10:30:00
  const now = (process.env.NODE_ENV === "development" && _t) ? new Date(_t) : new Date();

  const gradeNum = grade ? parseInt(grade) : undefined;
  const expandedId = expand ?? null;

  const today = utcMidnight(now);
  const startHour = 8;
  const minutesSinceStart = (now.getHours() - startHour) * 60 + now.getMinutes();
  const currentPeriod = Math.min(7, Math.max(1, Math.ceil(minutesSinceStart / 45)));
  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const schoolDow = isWeekend ? 0 : dayOfWeek;

  // Homeroom groups only
  const homeroomGroups = gradeNum
    ? await db.group.findMany({
        where: { grade: gradeNum, students: { some: {} } },
        orderBy: [{ grade: "asc" }, { name: "asc" }],
      })
    : [];

  // Students in selected group
  const students = groupId
    ? await db.studentProfile.findMany({
        where: { groupId, user: { isActive: true } },
        include: {
          user: { select: { name: true } },
          attendance: {
            where: { date: today, timetableSlot: { period: { lte: currentPeriod } } },
            include: { timetableSlot: { select: { period: true } } },
          },
        },
        orderBy: { user: { name: "asc" } },
      })
    : [];

  // Per-student, per-period attendance map
  const periodAttendance: Record<string, Record<number, string>> = {};
  for (const s of students) {
    periodAttendance[s.id] = {};
    for (const a of s.attendance) {
      periodAttendance[s.id]![a.timetableSlot.period] = a.status;
    }
  }

  // Activity map for all periods today
  const activityPeriods: Record<string, Set<number>> = {};
  if (students.length > 0 && !isWeekend) {
    const allActs = await db.activityParticipant.findMany({
      where: {
        studentId: { in: students.map((s) => s.id) },
        activity: { date: today },
      },
      select: {
        studentId: true,
        activity: { select: { startPeriod: true, endPeriod: true } },
      },
    });
    for (const ap of allActs) {
      if (!activityPeriods[ap.studentId]) activityPeriods[ap.studentId] = new Set();
      for (let p = ap.activity.startPeriod; p <= ap.activity.endPeriod; p++) {
        activityPeriods[ap.studentId]!.add(p);
      }
    }
  }
  const activityStudentIds = new Set(
    Object.entries(activityPeriods)
      .filter(([, ps]) => ps.has(currentPeriod))
      .map(([id]) => id)
  );

  // ── Expanded student day schedule ─────────────────────────────────────────
  type DayRow = {
    period: number;
    courseName: string | null;
    room: string | null;
    staffName: string | null;
    isActivity: boolean;
    activityName?: string;
  };
  let expandedRows: DayRow[] = [];

  const expandedStudent = expandedId ? students.find((s) => s.id === expandedId) ?? null : null;

  if (expandedStudent && !isWeekend) {
    const subjectEnrollments = await db.studentGroup.findMany({
      where: { studentProfileId: expandedStudent.id },
      select: { groupId: true },
    });
    const allGroupIds = [
      expandedStudent.groupId,
      ...subjectEnrollments.map((e) => e.groupId),
    ].filter(Boolean) as string[];

    const [daySlots, dayActivities] = await Promise.all([
      allGroupIds.length > 0
        ? db.timetableSlot.findMany({
            where: { groupId: { in: allGroupIds }, dayOfWeek: schoolDow },
            include: {
              course: { select: { name: true } },
              staff: { include: { user: { select: { name: true } } } },
            },
            orderBy: { period: "asc" },
          })
        : Promise.resolve([]),
      db.activity.findMany({
        where: { date: today, participants: { some: { studentId: expandedStudent.id } } },
        orderBy: { startPeriod: "asc" },
      }),
    ]);

    // Build period map: homeroom first, subject group overrides
    const periodMap: Record<number, (typeof daySlots)[0]> = {};
    for (const s of daySlots.filter((s) => s.groupId === expandedStudent.groupId)) {
      periodMap[s.period] = s;
    }
    for (const s of daySlots.filter((s) => s.groupId !== expandedStudent.groupId)) {
      periodMap[s.period] = s;
    }

    const actByPeriod: Record<number, string> = {};
    for (const act of dayActivities) {
      for (let p = act.startPeriod; p <= act.endPeriod; p++) actByPeriod[p] = act.name;
    }

    expandedRows = PERIODS.map((p) => ({
      period: p,
      courseName: periodMap[p]?.course.name ?? null,
      room: periodMap[p]?.room ?? null,
      staffName: periodMap[p]?.staffName ?? periodMap[p]?.staff?.user.name ?? null,
      isActivity: !!actByPeriod[p],
      activityName: actByPeriod[p],
    }));
  }

  const selectedGroup = groupId ? homeroomGroups.find((g) => g.id === groupId) ?? null : null;

  // URL helpers
  const baseParams = (extra?: Record<string, string>) => {
    const p = new URLSearchParams();
    if (gradeNum) p.set("grade", String(gradeNum));
    if (groupId) p.set("groupId", groupId);
    if (_t && process.env.NODE_ENV === "development") p.set("_t", _t);
    for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v);
    return p.toString();
  };

  function studentHref(sId: string) {
    return expandedId === sId
      ? `?${baseParams()}` // collapse
      : `?${baseParams({ expand: sId })}`; // expand
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Locate Student</h2>
        {!isWeekend && (
          <p className="text-slate-500 text-sm mt-1">
            Period {currentPeriod} · {now.toLocaleTimeString("el-GR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>

      {/* Step 1 — Year */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Year</p>
        <div className="flex gap-2 flex-wrap">
          {[1, 2, 3].map((g) => (
            <Link
              key={g}
              href={`?grade=${g}${_t && process.env.NODE_ENV === "development" ? `&_t=${_t}` : ""}`}
              className={cn(
                "h-10 px-6 rounded-xl text-sm font-medium transition-colors border",
                gradeNum === g
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-white text-slate-600 border-slate-200 hover:border-emerald-400 hover:text-emerald-700"
              )}
            >
              Year {g}
            </Link>
          ))}
        </div>
      </div>

      {/* Step 2 — Homegroup */}
      {gradeNum && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Homegroup</p>
          <div className="flex gap-2 flex-wrap">
            {homeroomGroups.map((g) => (
              <Link
                key={g.id}
                href={`?grade=${gradeNum}&groupId=${g.id}${_t && process.env.NODE_ENV === "development" ? `&_t=${_t}` : ""}`}
                className={cn(
                  "h-10 px-5 rounded-xl text-sm font-medium transition-colors border",
                  groupId === g.id
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-400 hover:text-slate-800"
                )}
              >
                {g.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Step 3 — Students with inline schedule */}
      {groupId && selectedGroup && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
            {selectedGroup.name} · {students.length} student{students.length !== 1 ? "s" : ""}
          </p>
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100">
                {students.map((s) => {
                  const currentStatus = periodAttendance[s.id]?.[currentPeriod];
                  const onActivity = activityStudentIds.has(s.id);
                  const isExpanded = expandedId === s.id;

                  const periodStrip = !isWeekend
                    ? Array.from({ length: currentPeriod }, (_, i) => i + 1)
                    : [];

                  return (
                    <div key={s.id}>
                      {/* Student row */}
                      <Link
                        href={studentHref(s.id)}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 transition-colors",
                          isExpanded
                            ? "bg-slate-50"
                            : "hover:bg-slate-50"
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <span className={cn(
                            "block text-sm font-medium transition-colors",
                            isExpanded ? "text-emerald-700" : "text-slate-900"
                          )}>
                            {s.user.name}
                          </span>
                          {periodStrip.length > 0 && (
                            <div className="flex items-end gap-1.5 mt-1">
                              {periodStrip.map((p) => {
                                const isAct = activityPeriods[s.id]?.has(p) ?? false;
                                const status = periodAttendance[s.id]?.[p];
                                let dc = "bg-yellow-300";
                                if (isAct)                 dc = "bg-violet-400";
                                else if (status === "PRESENT") dc = "bg-green-500";
                                else if (status === "LATE")    dc = "bg-amber-400";
                                else if (status)               dc = "bg-red-500";
                                return (
                                  <div key={p} className="flex flex-col items-center gap-0.5">
                                    <span className="text-[9px] leading-none font-semibold text-slate-400">P{p}</span>
                                    <span className={`w-3 h-3 rounded-full ${dc}`} />
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        {isExpanded
                          ? <ChevronDown className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                        }
                      </Link>

                      {/* Inline day schedule */}
                      {isExpanded && (
                        <div className="border-t border-slate-100 bg-slate-50/80 px-4 pt-3 pb-4">
                          {isWeekend ? (
                            <p className="text-sm text-slate-400 py-2">No school today.</p>
                          ) : (
                            <table className="w-full text-sm">
                              <tbody>
                                {expandedRows.map((row) => {
                                  const isCurrent = row.period === currentPeriod;
                                  return (
                                    <tr
                                      key={row.period}
                                      className={cn(
                                        "border-b border-slate-100 last:border-0",
                                        isCurrent && "bg-emerald-50/70"
                                      )}
                                    >
                                      <td className={cn(
                                        "py-2 pr-3 text-xs font-bold w-10",
                                        isCurrent ? "text-emerald-600" : "text-slate-400"
                                      )}>
                                        P{row.period}
                                        {isCurrent && <span className="ml-1 text-[9px]">▶</span>}
                                      </td>
                                      {row.isActivity ? (
                                        <td colSpan={3} className="py-2">
                                          <span className="font-medium text-violet-700">{row.activityName}</span>
                                          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 bg-violet-50 text-violet-700 border-violet-200">Activity</Badge>
                                        </td>
                                      ) : row.courseName ? (
                                        <>
                                          <td className="py-2 font-medium text-slate-800">{row.courseName}</td>
                                          <td className="py-2 text-slate-400 text-xs">{row.staffName ?? ""}</td>
                                          <td className="py-2 text-slate-400 text-xs text-right">{row.room ? `Room ${row.room}` : ""}</td>
                                        </>
                                      ) : (
                                        <td colSpan={3} className="py-2 text-slate-300">—</td>
                                      )}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}

                          <div className="mt-3 flex justify-end">
                            <Link
                              href={`/${locale}/teacher/students/${s.id}?view=week`}
                              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-emerald-700 transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Full week schedule
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {students.length === 0 && (
                  <p className="px-4 py-8 text-center text-sm text-slate-400">No students in this group</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {!gradeNum && <p className="text-sm text-slate-400">Select a year to get started.</p>}
      {gradeNum && !groupId && homeroomGroups.length === 0 && (
        <p className="text-sm text-slate-400">No homeroom groups found for Year {gradeNum}.</p>
      )}
    </div>
  );
}
