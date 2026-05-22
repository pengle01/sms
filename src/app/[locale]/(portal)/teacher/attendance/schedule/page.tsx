import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { utcMidnight } from "@/lib/dates";
import Link from "next/link";
import { CheckCircle2, ClipboardList, AlertCircle } from "lucide-react";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

type Slot = {
  id: string;
  dayOfWeek: number;
  period: number;
  room: string | null;
  groupId: string;
  course: { name: string };
  group: { name: string };
};

export default async function TeacherSchedulePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect(`/${locale}/login`);

  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id } });
  if (!staff) redirect(`/${locale}/teacher/setup`);

  const now = new Date();
  const todayDow = now.getDay();
  const isWeekend = todayDow === 0 || todayDow === 6;
  const today = utcMidnight();

  const slots: Slot[] = await db.timetableSlot.findMany({
    where: { staffId: staff.id },
    include: { course: true, group: true },
    orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
  });

  const slotMap: Record<number, Record<number, Slot>> = {};
  for (const s of slots) {
    slotMap[s.dayOfWeek] ??= {};
    slotMap[s.dayOfWeek]![s.period] = s;
  }

  const maxPeriod = slots.reduce((m, s) => Math.max(m, s.period), 0);
  const periods = maxPeriod > 0 ? Array.from({ length: maxPeriod }, (_, i) => i + 1) : [];

  const todaySlots = !isWeekend ? slots.filter((s) => s.dayOfWeek === todayDow) : [];
  const markedSlotIds = new Set<string>();

  if (todaySlots.length > 0) {
    const existing = await db.attendance.findMany({
      where: { date: today, timetableSlotId: { in: todaySlots.map((s) => s.id) } },
      select: { timetableSlotId: true },
      distinct: ["timetableSlotId"],
    });
    for (const a of existing) markedSlotIds.add(a.timetableSlotId);
  }

  const dateLabel = now.toLocaleDateString("el-GR", {
    weekday: "long", day: "numeric", month: "long",
  });

  if (slots.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">My Schedule</h2>
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          No timetable slots are linked to your account yet. Ask an administrator to import the schedule.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">My Schedule</h2>
        <p className="text-slate-500 text-sm mt-1">{dateLabel}</p>
      </div>

      {/* Week grid */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[520px] text-sm border-collapse">
          <thead>
            <tr>
              <th className="w-14 border-b border-slate-100 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400" />
              {([1, 2, 3, 4, 5] as const).map((dow) => {
                const isToday = dow === todayDow;
                return (
                  <th
                    key={dow}
                    className={`border-b border-slate-100 px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide ${
                      isToday ? "bg-emerald-50 text-emerald-700" : "text-slate-400"
                    }`}
                  >
                    {DAYS[dow - 1]}
                    {isToday && (
                      <span className="ml-1.5 inline-block rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                        today
                      </span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period} className="border-b border-slate-50 last:border-0">
                <td className="px-4 py-2 text-center align-top text-xs font-semibold text-slate-400">
                  {period}
                </td>
                {([1, 2, 3, 4, 5] as const).map((dow) => {
                  const slot = slotMap[dow]?.[period];
                  const isToday = dow === todayDow && !isWeekend;
                  const marked = slot ? markedSlotIds.has(slot.id) : false;

                  const cellContent = slot ? (
                    <div
                      className={`rounded-lg px-3 py-2.5 ${
                        isToday
                          ? marked
                            ? "border border-emerald-200 bg-emerald-100"
                            : "border border-emerald-300 bg-emerald-50 group-hover:border-emerald-400 group-hover:bg-emerald-100"
                          : "border border-slate-100 bg-slate-50"
                      }`}
                    >
                      <p className="text-xs font-semibold leading-snug text-slate-900">
                        {slot.course.name}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">{slot.group.name}</p>
                      {slot.room && (
                        <p className="text-xs text-slate-400">Room {slot.room}</p>
                      )}
                      {isToday && marked && (
                        <div className="mt-1.5 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span className="text-xs font-medium text-emerald-600">Done</span>
                        </div>
                      )}
                      {isToday && !marked && (
                        <div className="mt-1.5 flex items-center gap-1">
                          <ClipboardList className="w-3 h-3 text-emerald-500" />
                          <span className="text-xs font-medium text-emerald-600">Mark</span>
                        </div>
                      )}
                    </div>
                  ) : null;

                  return (
                    <td
                      key={dow}
                      className={`px-2 py-2 align-top ${isToday ? "bg-emerald-50/30" : ""}`}
                    >
                      {slot && isToday ? (
                        <Link
                          href={`/${locale}/teacher/attendance/mark?groupId=${slot.groupId}&period=${slot.period}`}
                          className="group block"
                        >
                          {cellContent}
                        </Link>
                      ) : (
                        cellContent
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
