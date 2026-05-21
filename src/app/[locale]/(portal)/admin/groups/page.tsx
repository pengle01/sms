import { db } from "@/server/db";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Users, GraduationCap } from "lucide-react";
import Link from "next/link";

export default async function GroupsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const groups = await db.group.findMany({
    include: {
      homeroomTeacher: { include: { user: { select: { name: true } } } },
      _count: { select: { students: true } },
    },
    orderBy: [{ grade: "asc" }, { name: "asc" }],
  });

  const byGrade = groups.reduce<Record<number, typeof groups>>((acc, g) => {
    (acc[g.grade] ??= []).push(g);
    return acc;
  }, {});

  const gradeLabel: Record<number, string> = { 1: "Grade A", 2: "Grade B", 3: "Grade C" };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Groups</h2>
          <p className="text-slate-500 text-sm mt-1">{groups.length} groups total</p>
        </div>
      </div>

      {Object.entries(byGrade).map(([grade, gradeGroups]) => (
        <div key={grade}>
          <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">
            {gradeLabel[Number(grade)]}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {gradeGroups.map((group) => (
              <Link key={group.id} href={`/${locale}/admin/groups/${group.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer border-slate-200">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg font-bold text-slate-900">
                        {group.name}
                      </CardTitle>
                      <div className="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                        <GraduationCap className="w-5 h-5 text-emerald-600" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-slate-600">
                      <Users className="w-4 h-4 text-slate-400" />
                      <span>{group._count.students} students</span>
                    </div>
                    {group.homeroomTeacher ? (
                      <p className="text-xs text-slate-500 truncate">
                        Homeroom: {group.homeroomTeacher.user.name}
                      </p>
                    ) : (
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                        No homeroom teacher
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {groups.length === 0 && (
        <div className="text-center py-20 text-slate-400">
          <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No groups yet</p>
          <p className="text-sm mt-1">Groups can be imported via Excel or created manually</p>
        </div>
      )}
    </div>
  );
}
