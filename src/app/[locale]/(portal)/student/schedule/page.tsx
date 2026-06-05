import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getPeriodsPerDay } from "@/lib/schoolConfig";
import { getNow, utcMidnight } from "@/lib/dates";
import { getDayOverrides } from "@/server/substitutions";
import { periodsForDow, maxPeriodCount, periodLabel } from "@/lib/periods";
import { cn } from "@/lib/utils";

export default async function StudentSchedulePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const student = await db.studentProfile.findUnique({
    where: { userId: session.user.id },
    include: { group: true, subjectGroups: { select: { groupId: true } } },
  });
  if (!student) redirect(`/${locale}/login`);

  const t = await getTranslations("mySchedule");
  const tShared = await getTranslations("tests");
  const DOW = tShared.raw("dow") as string[];

  const groupIds = [
    ...new Set([
      ...(student.groupId ? [student.groupId] : []),
      ...student.subjectGroups.map((sg) => sg.groupId),
    ]),
  ];

  const [slots, periodsConfig] = await Promise.all([
    groupIds.length > 0
      ? db.timetableSlot.findMany({
          where: { groupId: { in: groupIds } },
          include: {
            course: { select: { name: true } },
            staff: { include: { user: { select: { name: true } } } },
            group: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    getPeriodsPerDay(),
  ]);

  // Homegroup slots first, subject-group slots override the same cell.
  type Slot = (typeof slots)[number] & { isSubjectGroup?: boolean };
  const grid = new Map<number, Slot>();
  for (const s of slots.filter((s) => s.groupId === student.groupId)) {
    grid.set(s.dayOfWeek * 100 + s.period, s);
  }
  for (const s of slots.filter((s) => s.groupId !== student.groupId)) {
    grid.set(s.dayOfWeek * 100 + s.period, { ...s, isSubjectGroup: true });
  }

  const teacherName = (s: Slot) => s.staff?.scheduleName ?? s.staffName ?? s.staff?.user?.name ?? null;

  const allPeriods = Array.from({ length: maxPeriodCount(periodsConfig) }, (_, i) => i + 1);
  const days = [1, 2, 3, 4, 5];

  // Highlight today's column (no highlight on weekends)
  const todayDow = getNow().getDay();

  // Today's finalized substitutions touching this student's groups → per-period
  const overrides = await getDayOverrides(utcMidnight());
  const todayOverride = new Map<number, { label: string; sub: string | null; newRoom: string | null }>();
  if (overrides) {
    for (const gid of groupIds) {
      for (const e of overrides.forGroup(gid)) {
        if (e.period == null) continue;
        const label =
          e.kind === "RELEASE"
            ? t("released")
            : e.kind === "STUDY_HALL"
              ? "Φ/δι"
              : e.kind === "ROOM_CHANGE"
                ? t("roomChanged")
                : t("substituteLabel");
        todayOverride.set(e.period, {
          label,
          sub: e.substituteStaff?.scheduleName ?? null,
          newRoom: e.newRoom,
        });
      }
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
        <p className="text-slate-500 text-sm mt-1">{student.group?.name ?? t("noGroup")}</p>
      </div>

      {grid.size === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <CalendarDays className="w-12 h-12 mb-3 opacity-30" />
          <p>{t("noTimetable")}</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-3 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide w-12" />
                  {days.map((d) => (
                    <th
                      key={d}
                      className={cn(
                        "px-3 py-3 text-xs font-semibold uppercase tracking-wide text-left",
                        d === todayDow ? "text-emerald-700 bg-emerald-50/70" : "text-slate-500"
                      )}
                    >
                      {DOW[d]}
                      {d === todayDow && <span className="ml-1 text-emerald-500">●</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {allPeriods.map((p) => (
                  <tr key={p}>
                    <td className="px-3 py-2 text-xs font-bold text-slate-400 align-top">
                      {periodLabel(p, locale)}
                    </td>
                    {days.map((d) => {
                      const isToday = d === todayDow;
                      const todayBg = isToday ? "bg-emerald-50/40" : undefined;
                      const inDay = periodsForDow(periodsConfig, d).includes(p);
                      const slot = grid.get(d * 100 + p);
                      if (!inDay) return <td key={d} className={cn("px-3 py-2", isToday ? "bg-emerald-50/40" : "bg-slate-50/60")} />;
                      if (!slot) return <td key={d} className={cn("px-3 py-2", todayBg)} />;
                      const override = isToday ? todayOverride.get(p) : undefined;
                      return (
                        <td key={d} className={cn("px-1.5 py-1.5 align-top", todayBg)}>
                          <div
                            className={cn(
                              "rounded-lg px-2 py-1.5 border",
                              override ? "border-sky-200 bg-sky-50" : "border-slate-100 bg-slate-50/80"
                            )}
                          >
                            <p className="font-medium text-slate-900 text-xs leading-snug">{slot.course.name}</p>
                            {override ? (
                              <p className="text-[11px] text-sky-700 font-medium mt-0.5">
                                {override.label}
                                {override.sub && `: ${override.sub}`}
                              </p>
                            ) : (
                              teacherName(slot) && (
                                <p className="text-[11px] text-slate-500 mt-0.5">{teacherName(slot)}</p>
                              )
                            )}
                            <p className="text-[10px] text-slate-400 mt-0.5">
                              {slot.isSubjectGroup && (
                                <span className="text-indigo-500 font-medium">{slot.group.name}</span>
                              )}
                              {slot.isSubjectGroup && (override?.newRoom ?? slot.room) && " · "}
                              {(override?.newRoom ?? slot.room) &&
                                t("room", { room: override?.newRoom ?? slot.room ?? "" })}
                            </p>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
