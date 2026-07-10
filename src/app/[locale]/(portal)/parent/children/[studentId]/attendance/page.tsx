import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, LogOut } from "lucide-react";
import { monthStart, monthEnd, localDateStr, fmtDisplayDate } from "@/lib/dates";
import { staffDisplayName } from "@/lib/staffName";

export default async function ParentChildAttendancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; studentId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  const { locale, studentId } = await params;
  const t = await getTranslations("parentAttendance");
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  // Verify parent is linked to this student
  const parent = await db.parentProfile.findUnique({
    where: { userId: session.user.id },
    include: { children: true },
  });
  if (!parent || !parent.children.some((c) => c.studentProfileId === studentId)) {
    redirect(`/${locale}/parent/children`);
  }

  const student = await db.studentProfile.findUnique({
    where: { id: studentId },
    include: {
      user: { select: { name: true } },
      group: true,
    },
  });
  if (!student) redirect(`/${locale}/parent/children`);

  const { month: monthStr } = await searchParams;
  const [year, month] = monthStr
    ? monthStr.split("-").map(Number) as [number, number]
    : localDateStr().split("-").map(Number).slice(0, 2) as [number, number];

  const start = monthStart(year, month);
  const end = monthEnd(year, month);

  const records = await db.attendance.findMany({
    where: {
      studentId,
      date: { gte: start, lt: end },
      OR: [{ status: "ABSENT" }, { status: "LATE" }],
    },
    include: { timetableSlot: { include: { course: true } } },
    orderBy: [{ date: "desc" }, { timetableSlot: { period: "asc" } }],
  });

  // Exit permits covering this month — the deputy issues these after phoning the
  // guardian, so the parent gets a record of every early departure.
  const permits = await db.exitPermit.findMany({
    where: { studentId, date: { gte: start, lt: end } },
    include: { issuer: { select: { scheduleName: true, user: { select: { name: true } } } } },
    orderBy: [{ date: "desc" }, { fromPeriod: "asc" }],
  });

  const allRecords = await db.attendance.findMany({
    where: { studentId, date: { gte: start, lt: end } },
  });
  const absent = allRecords.filter((r) => r.status === "ABSENT" || r.isAutoAbsent).length;
  const late = allRecords.filter((r) => r.status === "LATE").length;

  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{student.user?.name}</h2>
        <p className="text-slate-500 text-sm mt-1">{t("subtitle", { group: student.group?.name ?? t("noGroup") })}</p>
      </div>

      <div className="flex items-center gap-3">
        <a
          href={`?month=${prevYear}-${String(prevMonth).padStart(2, "0")}`}
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm hover:bg-slate-50 flex items-center"
        >
          ←
        </a>
        <span className="font-medium text-slate-900">
          {start.toLocaleDateString(locale === "en" ? "en-GB" : "el-GR", { month: "long", year: "numeric" })}
        </span>
        <a
          href={`?month=${nextYear}-${String(nextMonth).padStart(2, "0")}`}
          className="h-9 px-3 rounded-lg border border-slate-200 text-sm hover:bg-slate-50 flex items-center"
        >
          →
        </a>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{absent}</p>
            <p className="text-xs text-slate-500 mt-1">{t("absences")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600">{late}</p>
            <p className="text-xs text-slate-500 mt-1">{t("lateArrivals")}</p>
          </CardContent>
        </Card>
      </div>

      {permits.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <LogOut className="w-4 h-4 text-yellow-500" />
              {t("exitPermits")}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-50">
              {permits.map((p) => (
                <div key={p.id} className="flex items-start gap-3 px-5 py-3.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {fmtDisplayDate(p.date)} · {t("fromPeriod", { period: p.fromPeriod })}
                    </p>
                    <p className="text-sm text-slate-600">{p.reason}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {t("issuedBy", { name: staffDisplayName(p.issuer) })}
                    </p>
                  </div>
                  {!p.active && (
                    <Badge variant="outline" className="text-xs bg-slate-50 text-slate-500 border-slate-200">
                      {t("cancelled")}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("logTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colDate")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colPeriod")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colCourse")}</th>
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colStatus")}</th>
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
                    <Badge
                      variant="outline"
                      className={`text-xs ${r.isAutoAbsent || r.status === "ABSENT" ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}
                    >
                      {r.isAutoAbsent ? t("statusAutoAbsent") : r.status === "ABSENT" ? t("statusAbsent") : t("statusLate")}
                    </Badge>
                  </td>
                </tr>
              ))}
              {records.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-16 text-center text-slate-400">
                    <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    {t("emptyMonth")}
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
