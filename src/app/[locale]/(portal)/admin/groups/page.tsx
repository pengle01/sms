import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GraduationCap, Users, ChevronRight } from "lucide-react";
import { InlineTeacherAssign } from "./InlineTeacherAssign";

export default async function GroupsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "SUPER_ADMIN") redirect(`/${locale}/login`);

  const [groups, teachers] = await Promise.all([
    db.group.findMany({
      include: {
        homeroomTeacher: { include: { user: { select: { name: true } } } },
        _count: { select: { students: true, studentGroups: true } },
      },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
    }),
    db.staffProfile.findMany({
      where: { user: { role: { in: ["TEACHER", "HEADTEACHER_B"] } } },
      include: { user: { select: { name: true, role: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);

  const teacherOptions = teachers.map((t) => ({
    id: t.id,
    name: t.user.role === "HEADTEACHER_B"
      ? `${t.user.name} (B')`
      : (t.user.name ?? t.id),
  }));

  const homerooms = groups.filter((g) => g._count.students > 0);
  const supportGroups = groups.filter((g) => g._count.students === 0);

  const byGrade = homerooms.reduce<Record<number, typeof homerooms>>((acc, g) => {
    (acc[g.grade] ??= []).push(g);
    return acc;
  }, {});

  const gradeLabel: Record<number, string> = { 1: "Year 1", 2: "Year 2", 3: "Year 3" };

  const assigned = homerooms.filter((g) => g.homeroomTeacherId).length;
  const unassigned = homerooms.length - assigned;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Homeroom Groups</h2>
          <p className="text-slate-500 text-sm mt-1">
            {assigned} assigned · {unassigned > 0 && (
              <span className="text-amber-600 font-medium">{unassigned} unassigned</span>
            )}
            {unassigned === 0 && <span className="text-emerald-600 font-medium">all assigned</span>}
          </p>
        </div>
      </div>

      {/* Homeroom assignment table — per year */}
      {Object.entries(byGrade).map(([grade, gradeGroups]) => (
        <Card key={grade}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
              {gradeLabel[Number(grade)]}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide w-24">Group</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide w-16">
                    <Users className="w-3.5 h-3.5 inline mr-1" />Students
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-400 uppercase tracking-wide">Homeroom Teacher</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {gradeGroups.map((g) => (
                  <tr key={g.id} className="hover:bg-slate-50/60">
                    <td className="px-5 py-3 font-semibold text-slate-800">{g.name}</td>
                    <td className="px-4 py-3 text-slate-500">{g._count.students}</td>
                    <td className="px-4 py-3">
                      <InlineTeacherAssign
                        groupId={g.id}
                        currentStaffId={g.homeroomTeacherId}
                        teachers={teacherOptions}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/${locale}/admin/groups/${g.id}`}
                        className="text-slate-300 hover:text-slate-600 transition-colors"
                        title="View group"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ))}

      {homerooms.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No homeroom groups yet</p>
          <p className="text-sm mt-1">Import students to create homeroom groups</p>
        </div>
      )}

      {/* Support groups — collapsed info */}
      {supportGroups.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">
            Support / Subject Groups ({supportGroups.length})
          </p>
          <div className="flex flex-wrap gap-2">
            {supportGroups.map((g) => (
              <Link key={g.id} href={`/${locale}/admin/groups/${g.id}`}>
                <Badge variant="outline" className="text-slate-500 hover:text-slate-800 hover:border-slate-400 transition-colors cursor-pointer">
                  {g.name}
                  <span className="ml-1.5 text-slate-400">{g._count.studentGroups}</span>
                </Badge>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
