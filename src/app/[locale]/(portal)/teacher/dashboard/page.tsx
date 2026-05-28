import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import type { Role } from "@/generated/prisma";
import { getNow, utcMidnight, fmtDisplayDate } from "@/lib/dates";
import { getSpecialDayForDate } from "@/lib/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, ClipboardList, AlertCircle } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

function resolveFirstName(...candidates: (string | null | undefined)[]): string {
  for (const raw of candidates) {
    if (!raw) continue;
    if (raw.includes("@")) continue; // skip email-looking values
    const first = raw.trim().split(/\s+/)[0];
    if (first) return first;
  }
  // last resort: use the local part of the first email-looking candidate
  for (const raw of candidates) {
    if (raw?.includes("@")) return raw.split("@")[0]!;
  }
  return "";
}

export default async function TeacherDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const t = await getTranslations("dashboard");

  const staff = await db.staffProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      homeroomGroups: { select: { id: true, name: true } },
      homeroomHeadGroups: { select: { id: true, name: true } },
      user: { select: { name: true, nameEl: true } },
    },
  });
  if (!staff && (session.user.role as Role) === "TEACHER") redirect(`/${locale}/teacher/setup`);

  const homeroomGroup = staff
    ? ([...(staff.homeroomGroups ?? []), ...(staff.homeroomHeadGroups ?? [])].find(Boolean) ?? null)
    : null;

  const now = getNow();
  const todayDow = now.getDay();
  const isWeekend = todayDow === 0 || todayDow === 6;
  const today = utcMidnight();

  const todaySpecialDay = !isWeekend ? await getSpecialDayForDate(today) : null;
  const isTodayIntercalary = todaySpecialDay === "INTERCALARY";

  const todayMeetingPeriod: number | null = isTodayIntercalary
    ? await db.specialDay
        .findFirst({
          where: { type: "INTERCALARY", startDate: { lte: today }, endDate: { gte: today } },
          select: { intercalaryMeetingPeriod: true },
        })
        .then((r) => r?.intercalaryMeetingPeriod ?? 8)
    : null;

  const [allSlots, markedRaw, intercalaryMarkedRow] = await Promise.all([
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
    isTodayIntercalary && homeroomGroup && todayMeetingPeriod !== null
      ? db.attendance.findFirst({
          where: { intercalaryGroupId: homeroomGroup.id, intercalaryPeriod: todayMeetingPeriod, date: today },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  const todaySlots = allSlots.filter((s) => s.dayOfWeek === todayDow);
  const markedSlotIds = new Set(markedRaw.map((r) => r.timetableSlotId));
  const intercalaryMarked = intercalaryMarkedRow !== null;

  const normalMax = allSlots.reduce((m, s) => Math.max(m, s.period), 0);
  const maxPeriod = Math.max(normalMax, isTodayIntercalary && todayMeetingPeriod !== null ? todayMeetingPeriod : 0);

  const slotByPeriod = Object.fromEntries(todaySlots.map((s) => [s.period, s]));

  const dateLabel = fmtDisplayDate(now);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          {t("welcome", { name: resolveFirstName(staff?.user?.nameEl, staff?.user?.name, session.user?.name) })}
        </h2>
        <p className="text-slate-500 mt-1">{dateLabel}</p>
      </div>

      {allSlots.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {t("noTimetableSlots")}
        </div>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{t("todaySchedule")}</CardTitle>
              <Link
                href={`/${locale}/teacher/attendance/schedule`}
                className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                {t("fullWeek")}
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isWeekend ? (
              <p className="px-5 py-6 text-sm text-slate-400">{t("noSchoolToday")}</p>
            ) : maxPeriod === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400">{t("noTimetableSlots")}</p>
            ) : (
              <div className="divide-y divide-slate-50">
                {Array.from({ length: maxPeriod }, (_, i) => i + 1).map((period) => {
                  const isMeetingPeriod = isTodayIntercalary && todayMeetingPeriod === period;

                  // Intercalary meeting row — homegroup teacher
                  if (isMeetingPeriod && homeroomGroup) {
                    return (
                      <Link
                        key={period}
                        href={`/${locale}/teacher/attendance/mark?groupId=${homeroomGroup.id}&period=${todayMeetingPeriod}&intercalary=1`}
                        className={`flex items-center gap-4 px-5 py-3 transition-colors hover:bg-purple-50/40 ${intercalaryMarked ? "bg-purple-50/30" : ""}`}
                      >
                        <span className="w-5 flex-shrink-0 text-center text-sm font-bold text-purple-300">
                          {period}
                        </span>
                        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-purple-900">{homeroomGroup.name}</span>
                          <span className="text-xs text-purple-400">Intercalary</span>
                        </div>
                        {intercalaryMarked ? (
                          <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-purple-500" />
                        ) : (
                          <span className="text-xs font-medium text-purple-600 flex-shrink-0">
                            {t("markAttendance")}
                          </span>
                        )}
                      </Link>
                    );
                  }

                  // Intercalary meeting row — non-homegroup teacher (passive indicator)
                  if (isMeetingPeriod) {
                    return (
                      <div key={period} className="flex items-center gap-4 px-5 py-3">
                        <span className="w-5 flex-shrink-0 text-center text-sm font-semibold text-purple-200">
                          {period}
                        </span>
                        <span className="text-sm italic text-purple-300">Intercalary</span>
                      </div>
                    );
                  }

                  // On intercalary days, periods after the meeting row look up DB period - 1
                  const dbPeriod =
                    isTodayIntercalary && todayMeetingPeriod !== null && period > todayMeetingPeriod
                      ? period - 1
                      : period;
                  const slot = slotByPeriod[dbPeriod];
                  const marked = slot ? markedSlotIds.has(slot.id) : false;

                  if (!slot) {
                    return (
                      <div key={period} className="flex items-center gap-4 px-5 py-3">
                        <span className="w-5 flex-shrink-0 text-center text-sm font-semibold text-slate-200">
                          {period}
                        </span>
                        <span className="text-sm italic text-slate-300">{t("freePeriod")}</span>
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
                          <span className="text-xs text-slate-400 font-mono">{t("room", { room: slot.room })}</span>
                        )}
                      </div>
                      {marked ? (
                        <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-500" />
                      ) : (
                        <span className="text-xs font-medium text-emerald-600 flex-shrink-0">
                          {t("markAttendance")}
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
