import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import type { Role } from "@/generated/prisma";
import { db } from "@/server/db";
import { utcMidnight, localDateStr } from "@/lib/dates";
import Link from "next/link";
import { CheckCircle2, ClipboardList, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

type Slot = {
  id: string;
  dayOfWeek: number;
  period: number;
  room: string | null;
  groupId: string;
  course: { name: string };
  group: { name: string };
};

function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

export default async function TeacherSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { locale } = await params;
  const { week: weekParam } = await searchParams;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect(`/${locale}/login`);

  const tNav = await getTranslations("nav");
  const t = await getTranslations("attendance");
  const tCommon = await getTranslations("common");

  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id } });
  if (!staff && (session.user.role as Role) === "TEACHER") redirect(`/${locale}/teacher/setup`);

  const now = new Date();
  const todayStr = localDateStr(now);
  const todayDow = now.getDay();

  const weekOffset = weekParam ? parseInt(weekParam) : 0;

  const baseMon = getMondayOfWeek(now);
  baseMon.setDate(baseMon.getDate() + weekOffset * 7);

  const dowToDateStr: Record<number, string> = {};
  for (let d = 1; d <= 5; d++) {
    const dt = new Date(baseMon);
    dt.setDate(baseMon.getDate() + (d - 1));
    dowToDateStr[d] = localDateStr(dt);
  }

  const weekStartStr = dowToDateStr[1]!;
  const weekEndStr   = dowToDateStr[5]!;
  const isFutureWeek = weekStartStr > todayStr;
  const isCurrentWeek = weekOffset === 0;

  function isPastOrToday(dow: number) {
    return (dowToDateStr[dow] ?? "") <= todayStr;
  }

  const slots: Slot[] = staff
    ? await db.timetableSlot.findMany({
        where: { staffId: staff.id },
        include: { course: true, group: true },
        orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
      })
    : [];

  const slotMap: Record<number, Record<number, Slot>> = {};
  for (const s of slots) {
    slotMap[s.dayOfWeek] ??= {};
    slotMap[s.dayOfWeek]![s.period] = s;
  }

  const maxPeriod = slots.reduce((m, s) => Math.max(m, s.period), 0);
  const periods = maxPeriod > 0 ? Array.from({ length: maxPeriod }, (_, i) => i + 1) : [];

  const markedSet = new Set<string>();
  if (slots.length > 0 && !isFutureWeek) {
    const weekStart = utcMidnight(weekStartStr);
    const weekEnd   = utcMidnight(isCurrentWeek ? todayStr : weekEndStr);
    const existing = await db.attendance.findMany({
      where: {
        date: { gte: weekStart, lte: weekEnd },
        timetableSlotId: { in: slots.map((s) => s.id) },
      },
      select: { timetableSlotId: true, date: true },
    });
    for (const e of existing) {
      markedSet.add(`${e.timetableSlotId}::${e.date.toISOString().slice(0, 10)}`);
    }
  }

  const fmtDate = (str: string) => {
    const d = new Date(str + "T12:00:00");
    return d.toLocaleDateString(locale === "el" ? "el-GR" : "en-US", { day: "numeric", month: "short" });
  };
  const weekLabel = `${fmtDate(weekStartStr)} – ${fmtDate(weekEndStr)}`;

  const prevWeekHref = `?week=${weekOffset - 1}`;
  const nextWeekHref = `?week=${weekOffset + 1}`;
  const currentWeekHref = "?week=0";

  // Day label lookup using translations
  const dayLabel = (dow: number) => t(`daysShort.${dow}` as Parameters<typeof t>[0]);

  if (slots.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">{tNav("timetable")}</h2>
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {t("noSlots")}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header + week navigation */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-slate-900">{tNav("timetable")}</h2>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-slate-500 text-sm">{weekLabel}</p>
            {!isCurrentWeek && (
              <Link
                href={currentWeekHref}
                className="text-xs font-medium text-emerald-600 hover:text-emerald-700 transition-colors"
              >
                {t("thisWeek")}
              </Link>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <Link
            href={prevWeekHref}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
            title={t("previousWeek")}
          >
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <Link
            href={nextWeekHref}
            className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
            title={t("nextWeek")}
          >
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {isFutureWeek && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-500">
          {t("futureWeek")}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[520px] text-sm border-collapse">
          <thead>
            <tr>
              <th className="w-10 border-b border-slate-100 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400" />
              {([1, 2, 3, 4, 5] as const).map((dow) => {
                const dateStr = dowToDateStr[dow]!;
                const isToday = dateStr === todayStr;
                const past = isPastOrToday(dow);
                const [, mm, dd] = dateStr.split("-");
                return (
                  <th
                    key={dow}
                    className={`border-b border-slate-100 px-3 py-3 text-center text-xs font-semibold ${
                      isToday
                        ? "bg-emerald-50 text-emerald-700"
                        : past
                        ? "text-slate-600"
                        : "text-slate-300"
                    }`}
                  >
                    <span className="uppercase tracking-wide">{dayLabel(dow)}</span>
                    <span className={`ml-1.5 text-[11px] font-normal ${isToday ? "text-emerald-600" : past ? "text-slate-400" : "text-slate-300"}`}>
                      {dd}/{mm}
                    </span>
                    {isToday && (
                      <span className="ml-1.5 inline-block rounded-full bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none align-middle">
                        {tCommon("today")}
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
                <td className="px-3 py-2 text-center align-top text-xs font-semibold text-slate-400">
                  {period}
                </td>
                {([1, 2, 3, 4, 5] as const).map((dow) => {
                  const slot = slotMap[dow]?.[period];
                  const dateStr = dowToDateStr[dow]!;
                  const isToday = dateStr === todayStr;
                  const past = isPastOrToday(dow);
                  const canMark = past && !isFutureWeek;
                  const marked = slot ? markedSet.has(`${slot.id}::${dateStr}`) : false;

                  const cellContent = slot ? (
                    <div
                      className={`rounded-lg px-3 py-2.5 ${
                        canMark
                          ? marked
                            ? "border border-emerald-200 bg-emerald-50"
                            : isToday
                            ? "border border-emerald-300 bg-emerald-50 group-hover:border-emerald-400"
                            : "border border-amber-100 bg-amber-50/60 group-hover:border-amber-300"
                          : "border border-slate-100 bg-slate-50 opacity-40"
                      }`}
                    >
                      <p className="text-xs font-semibold leading-snug text-slate-900">{slot.course.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{slot.group.name}</p>
                      {slot.room && <p className="text-xs text-slate-400">Room {slot.room}</p>}
                      {canMark && marked && (
                        <div className="mt-1.5 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          <span className="text-xs font-medium text-emerald-600">{t("done")}</span>
                        </div>
                      )}
                      {canMark && !marked && (
                        <div className="mt-1.5 flex items-center gap-1">
                          <ClipboardList className={`w-3 h-3 ${isToday ? "text-emerald-500" : "text-amber-500"}`} />
                          <span className={`text-xs font-medium ${isToday ? "text-emerald-600" : "text-amber-600"}`}>
                            {isToday ? t("mark") : t("fillIn")}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : null;

                  return (
                    <td
                      key={dow}
                      className={`px-2 py-2 align-top ${isToday && isCurrentWeek ? "bg-emerald-50/30" : ""}`}
                    >
                      {slot && canMark ? (
                        <Link
                          href={`/${locale}/teacher/attendance/mark?groupId=${slot.groupId}&period=${slot.period}&date=${dateStr}`}
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
