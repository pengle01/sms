import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, BookOpen, ClipboardList } from "lucide-react";
import { utcMidnight, monthStart, localDateStr } from "@/lib/dates";
import Link from "next/link";

export default async function ParentChildrenPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const parent = await db.parentProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      children: {
        include: {
          studentProfile: {
            include: {
              user: { select: { name: true, email: true, isActive: true } },
              group: true,
            },
          },
        },
      },
    },
  });

  if (!parent) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <GraduationCap className="w-12 h-12 mb-3 opacity-30" />
        <p>No children linked to your account</p>
        <p className="text-sm mt-1">Contact the school administration</p>
      </div>
    );
  }

  // Get attendance stats for each child (this month)
  const childIds = parent.children.map((c) => c.studentProfileId);
  const [curYear, curMonth] = localDateStr().split("-").map(Number) as [number, number];
  const thisMonthStart = monthStart(curYear, curMonth);

  const [absencesThisMonth, recentGrades] = await Promise.all([
    db.attendance.groupBy({
      by: ["studentId"],
      where: {
        studentId: { in: childIds },
        date: { gte: thisMonthStart },
        OR: [{ status: "ABSENT" }, { isAutoAbsent: true }],
      },
      _count: true,
    }),
    db.grade.findMany({
      where: { studentId: { in: childIds } },
      include: { course: true },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
  ]);

  const absencesByStudent = Object.fromEntries(
    absencesThisMonth.map((a) => [a.studentId, a._count])
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">My Children</h2>
        <p className="text-slate-500 text-sm mt-1">{parent.children.length} enrolled</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {parent.children.map(({ studentProfile: s }) => {
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
                        {s.user.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 text-sm">
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <ClipboardList className="w-4 h-4 text-red-400" />
                    <span>{absences} absence{absences !== 1 ? "s" : ""} this month</span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Link
                    href={`/${locale}/parent/children/${s.id}/attendance`}
                    className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <ClipboardList className="w-3.5 h-3.5" />
                    Attendance
                  </Link>
                  <Link
                    href={`/${locale}/parent/children/${s.id}/grades`}
                    className="flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    Grades
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Recent grades across all children */}
      {recentGrades.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <h3 className="font-medium text-slate-900 mb-3">Recent Grades</h3>
            <div className="space-y-2">
              {recentGrades.map((g) => (
                <div key={g.id} className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-medium text-slate-900">{g.course.name}</span>
                    <span className="text-xs text-slate-400 ml-2">{g.period}</span>
                  </div>
                  <span className={`text-lg font-bold ${Number(g.value) >= 10 ? "text-green-700" : "text-red-700"}`}>
                    {Number(g.value).toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
