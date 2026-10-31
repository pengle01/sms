import { db } from "@/server/db";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, BookOpen, ClipboardList, FileText, LogOut } from "lucide-react";
import { utcMidnight, monthStart, localDateStr } from "@/lib/dates";
import Link from "next/link";

/**
 * A card per student with this month's absences, today's exit permit and
 * links to attendance / grades / tests — a parent's children and a
 * chaperone's students. `basePath` is the portal's student list
 * (e.g. /el/parent/children); the pages live under it.
 */
export async function GuardianStudentCards({
  locale,
  studentIds,
  basePath,
}: {
  locale: string;
  studentIds: string[];
  basePath: string;
}) {
  const t = await getTranslations({ locale, namespace: "parentChildren" });
  const [curYear, curMonth] = localDateStr().split("-").map(Number) as [number, number];
  const thisMonthStart = monthStart(curYear, curMonth);

  const [students, absencesThisMonth, permitsToday] = await Promise.all([
    db.studentProfile.findMany({
      where: { id: { in: studentIds } },
      include: { user: { select: { name: true, email: true, isActive: true } }, group: true },
      orderBy: { user: { name: "asc" } },
    }),
    db.attendance.groupBy({
      by: ["studentId"],
      where: {
        studentId: { in: studentIds },
        date: { gte: thisMonthStart },
        OR: [{ status: "ABSENT" }, { isAutoAbsent: true }],
      },
      _count: true,
    }),
    db.exitPermit.findMany({
      where: { studentId: { in: studentIds }, date: utcMidnight(), active: true },
      select: { studentId: true },
    }),
  ]);

  const absencesByStudent = Object.fromEntries(absencesThisMonth.map((a) => [a.studentId, a._count]));
  const permitTodayStudents = new Set(permitsToday.map((p) => p.studentId));

  return (
      <div className="grid gap-4 sm:grid-cols-2">
        {students.map((s) => {
          const absences = absencesByStudent[s.id] ?? 0;
          return (
            <Card key={s.id}>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <GraduationCap className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-slate-900">{s.user?.name}</h3>
                    <p className="text-sm text-slate-500">{s.studentId}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {s.group && (
                        <Badge variant="outline" className="text-xs">{s.group.name}</Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-xs ${s.user.isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}
                      >
                        {s.user.isActive ? t("statusActive") : t("statusInactive")}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-sm flex-wrap">
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <ClipboardList className="w-4 h-4 text-red-400" />
                    <span>{t("absencesThisMonth", { count: absences })}</span>
                  </div>
                  {permitTodayStudents.has(s.id) && (
                    <div className="flex items-center gap-1.5 rounded-full bg-yellow-50 border border-yellow-200 px-2.5 py-1 text-xs font-medium text-yellow-700">
                      <LogOut className="w-3.5 h-3.5" />
                      {t("exitPermitToday")}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Link
                    href={`${basePath}/${s.id}/attendance`}
                    className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    {t("linkAttendance")}
                  </Link>
                  <Link
                    href={`${basePath}/${s.id}/grades`}
                    className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    {t("linkGrades")}
                  </Link>
                  <Link
                    href={`${basePath}/${s.id}/tests`}
                    className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    {t("linkTests")}
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
  );
}
