import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import type { Role } from "@/generated/prisma";
import { utcMidnight } from "@/lib/dates";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, ClipboardList, AlertCircle } from "lucide-react";
import Link from "next/link";

export default async function TeacherDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id } });
  // Only plain teachers must claim a schedule — management roles may have no staffProfile
  if (!staff && (session.user.role as Role) === "TEACHER") redirect(`/${locale}/teacher/setup`);

  const now = new Date();
  const todayDow = now.getDay();
  const isWeekend = todayDow === 0 || todayDow === 6;
  const today = utcMidnight();

  const [allSlots, markedRaw] = await Promise.all([
    staff
      ? db.timetableSlot.findMany({
          where: { staffId: staff.id },
          include: { course: true, group: true },
          orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
        })
      : Promise.resolve([]),
    staff && !isWeekend
      ? db.attendance.findMany({
          where: { date: today, timetableSlot: { staffId: staff.id } },
          select: { timetableSlotId: true },
          distinct: ["timetableSlotId"],
        })
      : Promise.resolve([]),
  ]);

  const todaySlots = allSlots.filter((s) => s.dayOfWeek === todayDow);
  const markedSlotIds = new Set(markedRaw.map((r) => r.timetableSlotId));
  const maxPeriod = allSlots.reduce((m, s) => Math.max(m, s.period), 0);
  const slotByPeriod = Object.fromEntries(todaySlots.map((s) => [s.period, s]));

  const dateLabel = now.toLocaleDateString("el-GR", {
    weekday: "long", day: "numeric", month: "long",
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          Hello, {session.user?.name?.split(" ")[0]}
        </h2>
        <p className="text-slate-500 mt-1">{dateLabel}</p>
      </div>

      {allSlots.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          No timetable slots are linked to your account yet. Ask an administrator to import the schedule.
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Today&apos;s Schedule</CardTitle>
              <Link
                href={`/${locale}/teacher/attendance/schedule`}
                className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                Full week →
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isWeekend ? (
              <p className="px-5 py-6 text-sm text-slate-400">No school today.</p>
            ) : maxPeriod === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400">
                No timetable slots linked to your account yet.
              </p>
            ) : (
              <div className="divide-y divide-slate-50">
                {Array.from({ length: maxPeriod }, (_, i) => i + 1).map((period) => {
                  const slot = slotByPeriod[period];
                  const marked = slot ? markedSlotIds.has(slot.id) : false;

                  if (!slot) {
                    return (
                      <div key={period} className="flex items-center gap-4 px-5 py-3">
                        <span className="w-5 flex-shrink-0 text-center text-sm font-semibold text-slate-200">
                          {period}
                        </span>
                        <span className="text-sm italic text-slate-300">Free period</span>
                      </div>
                    );
                  }

                  return (
                    <Link
                      key={period}
                      href={`/${locale}/teacher/attendance/mark?groupId=${slot.groupId}&period=${slot.period}`}
                      className={`flex items-center gap-4 px-5 py-3 transition-colors hover:bg-slate-50 ${marked ? "bg-emerald-50/40" : ""}`}
                    >
                      <span className="w-5 flex-shrink-0 text-center text-sm font-bold text-slate-400">
                        {period}
                      </span>
                      <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-900">{slot.course.name}</span>
                        <span className="text-sm text-slate-400">{slot.group.name}</span>
                        {slot.room && (
                          <span className="text-xs text-slate-400 font-mono">Room {slot.room}</span>
                        )}
                      </div>
                      {marked ? (
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-500" />
                      ) : (
                        <span className="text-xs font-medium text-emerald-600 flex-shrink-0">
                          Mark →
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
