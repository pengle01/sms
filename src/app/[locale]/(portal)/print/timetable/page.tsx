import { redirect, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { getSchoolName, getSchoolYear, getPeriodsPerDay } from "@/lib/schoolConfig";
import { maxPeriodCount } from "@/lib/periods";
import { slotTeacherName } from "@/lib/staffName";
import { fmtDisplayDate, getNow } from "@/lib/dates";
import { WEEK_DAYS, weekGrid, cell } from "@/lib/whereabouts";
import { printTarget, canPrintTimetable, safeBack } from "@/lib/timetablePrint";
import { PrintBar } from "@/app/[locale]/(portal)/teacher/substitutions/plan/[date]/print/PrintBar";

/**
 * The fixed weekly timetable of one teacher, student or room on a landscape
 * A4 — the regular timetable only (no substitutions, holidays or special days).
 * Anyone who can view that schedule may print it (canPrintTimetable).
 */
export default async function TimetablePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ kind?: string; name?: string; id?: string; back?: string }>;
}) {
  const { locale } = await params;
  const query = await searchParams;
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  const target = printTarget(query);
  if (!target) notFound();

  const t = await getTranslations("timetablePrint");
  const tc = await getTranslations("common");

  const slotSelect = {
    dayOfWeek: true,
    period: true,
    room: true,
    staffName: true,
    group: { select: { name: true } },
    course: { select: { name: true, nameEl: true } },
    staff: { select: { scheduleName: true, user: { select: { name: true } } } },
  } as const;

  let title: string;
  let subtitle: string | null = null;
  let slots;

  if (target.kind === "student") {
    const student = await db.studentProfile.findUnique({
      where: { id: target.key },
      select: {
        userId: true,
        groupId: true,
        user: { select: { name: true } },
        group: { select: { name: true } },
        subjectGroups: { select: { groupId: true } },
      },
    });
    if (!student) notFound();
    if (!canPrintTimetable("student", auth.roles, { selfStudent: student.userId === auth.userId })) {
      redirect(`/${locale}/login`);
    }
    const groupIds = [student.groupId, ...student.subjectGroups.map((sg) => sg.groupId)].filter(
      (id): id is string => !!id,
    );
    slots = groupIds.length
      ? await db.timetableSlot.findMany({ where: { groupId: { in: groupIds } }, select: slotSelect })
      : [];
    title = t("titleStudent");
    subtitle = [student.user?.name, student.group?.name].filter(Boolean).join(" · ");
  } else {
    if (!canPrintTimetable(target.kind, auth.roles)) redirect(`/${locale}/login/staff`);
    if (target.kind === "teacher") {
      const [found, profile] = await Promise.all([
        db.timetableSlot.findMany({ where: { staffName: target.key }, select: slotSelect }),
        db.staffProfile.findFirst({ where: { scheduleName: target.key }, select: { user: { select: { name: true } } } }),
      ]);
      if (found.length === 0 && !profile) notFound();
      slots = found;
      title = t("titleTeacher");
      subtitle = [target.key, profile?.user?.name].filter(Boolean).join(" · ");
    } else {
      const [found, room] = await Promise.all([
        db.timetableSlot.findMany({ where: { room: target.key }, select: slotSelect }),
        db.room.findUnique({ where: { name: target.key }, select: { id: true } }),
      ]);
      if (found.length === 0 && !room) notFound();
      slots = found;
      title = t("titleRoom");
      subtitle = target.key;
    }
  }

  const [schoolName, schoolYear, periodsPerDay] = await Promise.all([
    getSchoolName(),
    getSchoolYear(),
    getPeriodsPerDay(),
  ]);
  const startYear = schoolYear.yearStart.getUTCFullYear();
  const grid = weekGrid(
    [...slots].sort((a, b) => a.group.name.localeCompare(b.group.name, "el", { numeric: true })),
  );
  const lastLesson = Math.max(0, ...slots.map((s) => s.period));
  const periods = Array.from({ length: Math.max(maxPeriodCount(periodsPerDay), lastLesson) }, (_, i) => i + 1);
  const courseName = (s: (typeof slots)[number]) => s.course.nameEl || s.course.name;

  return (
    <>
      <PrintBar backHref={safeBack(query.back, locale) ?? `/${locale}`} />

      <div className="bg-white min-h-screen print:min-h-0">
        <div className="mx-auto max-w-6xl px-8 py-8 print:max-w-none print:p-0">
          <div className="flex items-end justify-between gap-4 border-b-2 border-slate-800 pb-3 mb-4">
            <div>
              {schoolName && <p className="text-xs uppercase tracking-widest text-slate-500">{schoolName}</p>}
              <h1 className="text-xl font-bold text-slate-900 mt-1">{title}</h1>
              {subtitle && <p className="text-base font-semibold text-slate-700">{subtitle}</p>}
            </div>
            <p className="text-sm text-slate-600 whitespace-nowrap">
              {t("schoolYear", { year: `${startYear}-${startYear + 1}` })}
            </p>
          </div>

          <table className="w-full table-fixed border-collapse text-[11px] leading-tight">
            <thead>
              <tr>
                <th className="w-10 border border-slate-400 bg-slate-100 py-1.5" />
                {WEEK_DAYS.map((d) => (
                  <th key={d} className="border border-slate-400 bg-slate-100 py-1.5 text-sm font-semibold text-slate-800">
                    {t(`day${d}` as "day1")}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p} className="break-inside-avoid">
                  <td className="border border-slate-400 bg-slate-100 text-center text-sm font-semibold text-slate-700">
                    {tc("periodShort", { period: p })}
                  </td>
                  {WEEK_DAYS.map((d) => {
                    const noSchool = p > (periodsPerDay[d] ?? 7) && cell(grid, d, p).length === 0;
                    return (
                      <td
                        key={d}
                        className={`border border-slate-400 px-1.5 py-1 align-top h-14 ${noSchool ? "bg-slate-200" : ""}`}
                      >
                        {cell(grid, d, p).map((s, i) => (
                          <div key={i} className={i > 0 ? "mt-1 pt-1 border-t border-dashed border-slate-300" : ""}>
                            {target.kind === "student" ? (
                              <>
                                <p className="font-semibold text-slate-900">{courseName(s)}</p>
                                <p className="text-slate-600">{slotTeacherName(s)}</p>
                              </>
                            ) : (
                              <>
                                <p className="font-semibold text-slate-900">{s.group.name}</p>
                                <p className="text-slate-600">{courseName(s)}</p>
                              </>
                            )}
                            {target.kind === "room" ? (
                              <p className="text-slate-500">{slotTeacherName(s)}</p>
                            ) : (
                              s.room && <p className="text-slate-500">{t("room", { room: s.room })}</p>
                            )}
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-3 text-[10px] text-slate-400">
            {t("footer", { date: fmtDisplayDate(getNow()) })}
          </p>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          html, body { background: white !important; }
        }
      `}</style>
    </>
  );
}
