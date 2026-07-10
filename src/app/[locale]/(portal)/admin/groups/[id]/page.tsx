import { db } from "@/server/db";
import { staffDisplayName, slotTeacherName } from "@/lib/staffName";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect, notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Users, ArrowLeft, ClipboardList } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { utcMidnight } from "@/lib/dates";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const group = await db.group.findUnique({
    where: { id },
    include: {
      homeroomTeacher: { include: { user: { select: { name: true, email: true } } } },
      homeroomHeadteacher: { include: { user: { select: { name: true, email: true } } } },
      students: {
        include: { user: { select: { name: true, isActive: true } } },
        orderBy: { user: { name: "asc" } },
      },
      studentGroups: {
        include: {
          studentProfile: {
            include: { user: { select: { name: true, isActive: true } } },
          },
        },
        orderBy: { studentProfile: { user: { name: "asc" } } },
      },
      timetableSlots: {
        include: {
          course: true,
          staff: { include: { user: { select: { name: true } } } },
        },
        orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
      },
    },
  });

  if (!group) notFound();

  const today = utcMidnight();

  const todayAbsences = await db.attendance.count({
    where: {
      date: today,
      OR: [{ status: "ABSENT" }, { isAutoAbsent: true }],
      student: { groupId: id },
    },
  });

  const t = await getTranslations("adminGroupDetail");
  const tTests = await getTranslations("tests");
  // Reuse the shared Sun-first day-name array; index 1–5 = Mon–Fri.
  const DAY_NAMES = tTests.raw("dow") as string[];

  const byDay = group.timetableSlots.reduce<Record<number, typeof group.timetableSlots>>((acc, slot) => {
    (acc[slot.dayOfWeek] ??= []).push(slot);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link
          href={`/${locale}/admin/groups`}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
        >
          <ArrowLeft className="w-4 h-4" />
          {t("back")}
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{group.name}</h2>
          <p className="text-slate-500 text-sm mt-1">
            {t("gradeLabel", { grade: String(group.grade) })}
            {group.students.length > 0 && ` · ${t("homeroomCount", { count: group.students.length })}`}
            {group.studentGroups.length > 0 && ` · ${t("enrolledCount", { count: group.studentGroups.length })}`}
            {group.homeroomTeacher && ` · ${staffDisplayName(group.homeroomTeacher)}`}
            {group.homeroomHeadteacher && ` · ${staffDisplayName(group.homeroomHeadteacher)} (B')`}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-center px-4 py-2 bg-red-50 rounded-xl">
            <p className="text-xl font-bold text-red-600">{todayAbsences}</p>
            <p className="text-xs text-slate-500">{t("absentToday")}</p>
          </div>
          <Link
            href={`/${locale}/admin/attendance?groupId=${id}`}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"
          >
            <ClipboardList className="w-4 h-4" />
            {t("viewAttendance")}
          </Link>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Homeroom roster */}
        {group.students.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />
              {t("homeroomStudents", { count: group.students.length })}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colName")}</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colStatus")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {group.students.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">{s.user?.name}</td>
                    <td className="px-5 py-3">
                      <Badge
                        variant="outline"
                        className={`text-xs ${s.user.isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}
                      >
                        {s.user.isActive ? t("active") : t("inactive")}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {group.students.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-5 py-10 text-center text-slate-400">{t("noHomeroomStudents")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
        )}

        {/* Subject-enrolled students */}
        {group.studentGroups.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <GraduationCap className="w-4 h-4" />
              {t("enrolledStudents", { count: group.studentGroups.length })}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colName")}</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{t("colStatus")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {group.studentGroups.map(({ studentProfile: s }) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">{s.user?.name}</td>
                    <td className="px-5 py-3">
                      <Badge
                        variant="outline"
                        className={`text-xs ${s.user.isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-red-50 text-red-700 border-red-200"}`}
                      >
                        {s.user.isActive ? t("active") : t("inactive")}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
        )}

        {/* Timetable */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("weeklyTimetable")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[1, 2, 3, 4, 5].map((day) => {
              const slots = byDay[day] ?? [];
              if (slots.length === 0) return null;
              return (
                <div key={day}>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                    {DAY_NAMES[day]}
                  </p>
                  <div className="space-y-1">
                    {slots.map((slot) => (
                      <div key={slot.id} className="flex items-center gap-3 text-sm px-3 py-2 rounded-lg bg-slate-50">
                        <span className="text-slate-400 w-6 text-center font-mono text-xs">{slot.period}</span>
                        <span className="font-medium text-slate-900 flex-1">{slot.course.name}</span>
                        <span className="text-slate-500 text-xs">{slotTeacherName(slot)}</span>
                        {slot.room && (
                          <span className="text-slate-400 text-xs">{t("roomShort", { room: slot.room })}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {group.timetableSlots.length === 0 && (
              <p className="text-slate-400 text-sm py-4 text-center">{t("noTimetable")}</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
