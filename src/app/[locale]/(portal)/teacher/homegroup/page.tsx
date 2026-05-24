import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { utcMidnight, localDateStr } from "@/lib/dates";
import { AlertTriangle, FileText, CalendarCheck, Users, FlaskConical } from "lucide-react";

export default async function TeacherHomegroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ groupId?: string }>;
}) {
  const { locale } = await params;
  const { groupId: selectedGroupId } = await searchParams;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const staff = await db.staffProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      homeroomGroups: {
        include: { _count: { select: { students: true } } },
        orderBy: [{ grade: "asc" }, { name: "asc" }],
      },
    },
  });

  if (!staff || staff.homeroomGroups.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-slate-900">My Homegroup</h2>
        <p className="text-sm text-slate-400">You have not been assigned a homeroom group. Ask an administrator to assign one.</p>
      </div>
    );
  }

  const groups = staff.homeroomGroups;
  const activeGroup = groups.find((g) => g.id === selectedGroupId) ?? groups[0]!;

  const todayStr = localDateStr();
  const today = utcMidnight(todayStr);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const students = await db.studentProfile.findMany({
    where: { groupId: activeGroup.id, user: { isActive: true } },
    include: {
      user: { select: { name: true } },
      subjectGroups: { select: { groupId: true } },
    },
    orderBy: { user: { name: "asc" } },
  });

  const studentIds = students.map((s) => s.id);

  const twoWeeksFromNow = new Date(today);
  twoWeeksFromNow.setDate(today.getDate() + 14);

  const allStudentGroupIds = [
    ...new Set(
      students.flatMap((s) => [
        ...(s.groupId ? [s.groupId] : []),
        ...s.subjectGroups.map((sg) => sg.groupId),
      ])
    ),
  ];

  const [absences, referrals, upcomingTests, upcomingStudentTests] = await Promise.all([
    db.attendance.groupBy({
      by: ["studentId"],
      where: {
        studentId: { in: studentIds },
        date: { gte: thirtyDaysAgo },
        OR: [{ status: "ABSENT" }, { isAutoAbsent: true }],
      },
      _count: { _all: true },
    }),
    db.referral.groupBy({
      by: ["studentId"],
      where: {
        studentId: { in: studentIds },
        status: "PENDING",
      },
      _count: { _all: true },
    }),
    db.testSchedule.findMany({
      where: {
        groupId: activeGroup.id,
        date: { gte: today, lte: nextWeek },
      },
      include: { course: { select: { name: true } } },
      orderBy: [{ date: "asc" }, { period: "asc" }],
    }),
    db.testSchedule.findMany({
      where: {
        groupId: { in: allStudentGroupIds },
        date: { gte: today, lte: twoWeeksFromNow },
      },
      select: { groupId: true },
    }),
  ]);

  const absenceMap = Object.fromEntries(absences.map((a) => [a.studentId, a._count._all]));
  const referralMap = Object.fromEntries(referrals.map((r) => [r.studentId, r._count._all]));

  const testsByGroupId = new Map<string, number>();
  for (const t of upcomingStudentTests) {
    testsByGroupId.set(t.groupId, (testsByGroupId.get(t.groupId) ?? 0) + 1);
  }
  const testCountMap = new Map<string, number>();
  for (const s of students) {
    const groups = [s.groupId, ...s.subjectGroups.map((sg) => sg.groupId)].filter(Boolean) as string[];
    testCountMap.set(s.id, groups.reduce((sum, gId) => sum + (testsByGroupId.get(gId) ?? 0), 0));
  }

  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">My Homegroup</h2>
        <p className="text-slate-500 text-sm mt-1">Student overview · past 30 days</p>
      </div>

      {/* Group tabs (if multiple) */}
      {groups.length > 1 && (
        <div className="flex gap-2 flex-wrap">
          {groups.map((g) => (
            <Link
              key={g.id}
              href={`?groupId=${g.id}`}
              className={`h-9 px-4 rounded-lg text-sm font-medium border transition-colors ${
                activeGroup.id === g.id
                  ? "bg-slate-800 text-white border-slate-800"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
              }`}
            >
              {g.name}
            </Link>
          ))}
        </div>
      )}

      {/* Upcoming tests */}
      {upcomingTests.length > 0 && (
        <Card className="border-emerald-200 bg-emerald-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-emerald-800">
              <CalendarCheck className="w-4 h-4" />
              Upcoming Tests — Next 7 Days
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {upcomingTests.map((t) => (
              <div key={t.id} className="flex items-center gap-3 text-sm">
                <span className="text-emerald-700 font-medium">{t.course.name}</span>
                <span className="text-emerald-600 text-xs">
                  {DOW[t.date.getDay()]} {t.date.toLocaleDateString("el-GR", { day: "numeric", month: "short" })} · P{t.period}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Student table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" />
            {activeGroup.name} · {students.length} students
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">Student</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  <span className="flex items-center justify-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Absences
                  </span>
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  <span className="flex items-center justify-center gap-1">
                    <FileText className="w-3 h-3" /> Reports
                  </span>
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                  <span className="flex items-center justify-center gap-1">
                    <FlaskConical className="w-3 h-3" /> Tests
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {students.map((s) => {
                const abs = absenceMap[s.id] ?? 0;
                const refs = referralMap[s.id] ?? 0;
                const tests = testCountMap.get(s.id) ?? 0;
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">
                      <Link
                        href={`/${locale}/teacher/students/${s.id}`}
                        className="hover:text-emerald-700 hover:underline"
                      >
                        {s.user.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {abs > 0 ? (
                        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                          abs >= 10 ? "bg-red-100 text-red-700" :
                          abs >= 5  ? "bg-amber-100 text-amber-700" :
                                      "bg-slate-100 text-slate-600"
                        }`}>
                          {abs}
                        </span>
                      ) : (
                        <span className="text-slate-200">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {refs > 0 ? (
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold bg-orange-100 text-orange-700">
                          {refs}
                        </span>
                      ) : (
                        <span className="text-slate-200">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {tests > 0 ? (
                        <Link
                          href={`/${locale}/teacher/students/${s.id}`}
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                            tests >= 3 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
                          }`}
                          title={`${tests} upcoming test${tests !== 1 ? "s" : ""} (next 2 weeks)`}
                        >
                          {tests}
                        </Link>
                      ) : (
                        <span className="text-slate-200">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {students.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-slate-400">No active students in this group.</td>
                </tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
