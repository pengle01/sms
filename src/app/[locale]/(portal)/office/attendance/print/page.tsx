import { db } from "@/server/db";
import { redirect } from "next/navigation";
import { getActiveAuth } from "@/server/authz";
import { isOfficeAdmin, isAdminStaff } from "@/lib/rbac";
import { getTranslations } from "next-intl/server";
import { utcMidnight, localDateStr, fmtDisplayDate } from "@/lib/dates";
import { getSchoolName, getPeriodsPerDay, periodsForDow } from "@/lib/schoolConfig";
import { rollCall } from "@/lib/attendanceReport";
import { PrintTrigger, PrintButton } from "@/app/[locale]/(portal)/teacher/referrals/[referralId]/print/PrintTrigger";

/** A4 daily absence sheet — the thing that gets signed and filed. */
export default async function AbsencePrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string; groupId?: string }>;
}) {
  const { locale } = await params;
  const { date, groupId } = await searchParams;

  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  if (!auth.roles.some((r) => isOfficeAdmin(r) || isAdminStaff(r))) {
    redirect(`/${locale}/office/dashboard`);
  }

  const t = await getTranslations("officeAttendance");
  const dateStr = date ?? localDateStr();
  const day = utcMidnight(dateStr);
  const dow = day.getUTCDay();

  const [rows, schoolName, periodsCfg, group, scheduledRaw] = await Promise.all([
    db.attendance.findMany({
      where: {
        date: day,
        OR: [{ status: "ABSENT" }, { status: "LATE" }, { isAutoAbsent: true }],
        ...(groupId ? { student: { groupId } } : {}),
      },
      include: {
        student: { include: { user: { select: { name: true } }, group: true } },
        timetableSlot: { select: { period: true } },
      },
    }),
    getSchoolName(),
    getPeriodsPerDay(),
    groupId ? db.group.findUnique({ where: { id: groupId }, select: { name: true } }) : null,
    db.timetableSlot.groupBy({
      by: ["groupId"],
      where: { dayOfWeek: dow, ...(groupId ? { groupId } : {}) },
      _count: { _all: true },
    }),
  ]);

  const students = rollCall(
    rows.map((a) => ({
      studentProfileId: a.studentId,
      studentName: a.student.user?.name ?? "—",
      studentId: a.student.studentId,
      groupId: a.student.groupId,
      groupName: a.student.group?.name ?? null,
      date: dateStr,
      period: a.timetableSlot?.period ?? a.intercalaryPeriod ?? null,
      status: a.status,
      isAutoAbsent: a.isAutoAbsent,
      hasExitPermit: !!a.exitPermitId,
      waived: a.waived,
      smsSent: a.smsSent,
    })),
    new Map(scheduledRaw.map((g) => [g.groupId, g._count._all])),
  );
  const dayPeriods = periodsForDow(periodsCfg, dow).length;

  return (
    <>
      <PrintTrigger />
      <div className="min-h-screen bg-white print:bg-white">
        <div className="print:hidden flex items-center justify-between px-8 py-4 border-b border-slate-200 bg-slate-50">
          <a href={`/${locale}/office/attendance`} className="text-sm text-slate-500 hover:text-slate-800">
            ← {t("title")}
          </a>
          <PrintButton />
        </div>

        <div className="max-w-3xl mx-auto px-12 py-10 print:px-0 print:py-0 print:max-w-none">
          <div className="text-center mb-6 pb-4 border-b-2 border-slate-800">
            <p className="text-xs uppercase tracking-widest text-slate-500 mb-1">{schoolName ?? ""}</p>
            <h1 className="text-xl font-bold text-slate-900 mt-2">{t("printTitle")}</h1>
            <p className="text-sm font-semibold text-slate-700 mt-1">
              {fmtDisplayDate(day)}
              {group ? ` · ${group.name}` : ""}
            </p>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-300">
                <th className="text-left py-1.5 font-semibold">{t("colStudent")}</th>
                <th className="text-left py-1.5 font-semibold">{t("colGroup")}</th>
                <th className="text-left py-1.5 font-semibold">{t("colPeriods")}</th>
                <th className="text-right py-1.5 font-semibold">{t("colTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400">{t("dailyEmpty")}</td>
                </tr>
              ) : (
                students.map((s) => (
                  <tr key={s.studentProfileId} className="border-b border-slate-100">
                    <td className="py-1.5">
                      {s.studentName}
                      <span className="ml-2 font-mono text-[10px] text-slate-400">{s.studentId}</span>
                      {s.wholeDay && <span className="ml-2 text-[10px] font-semibold text-red-700">{t("wholeDay")}</span>}
                    </td>
                    <td className="py-1.5">{s.groupName ?? "—"}</td>
                    <td className="py-1.5 font-mono text-xs">{s.periods.join(", ") || "—"}</td>
                    <td className="py-1.5 text-right">
                      {t("ofPeriods", { absent: s.periods.length, total: s.scheduled || dayPeriods })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          <p className="mt-4 text-xs text-slate-500">
            {t("dailySummary", {
              students: students.length,
              periods: students.reduce((n, s) => n + s.periods.length, 0),
              whole: students.filter((s) => s.wholeDay).length,
              waived: students.reduce((n, s) => n + s.waived, 0),
            })}
          </p>

          <div className="mt-16 w-64">
            <div className="border-t border-slate-400 pt-2 text-center text-xs text-slate-600">
              {t("signature")}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: A4; margin: 18mm; }
          body { background: white !important; }
        }
      `}</style>
    </>
  );
}
