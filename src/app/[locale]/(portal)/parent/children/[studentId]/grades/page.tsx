import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

const PERIODS = ["TERM1", "TERM2", "FINAL"] as const;
const PERIOD_LABELS: Record<string, string> = {
  TERM1: "Term 1",
  TERM2: "Term 2",
  FINAL: "Final",
};

function gradeColor(v: number) {
  if (v >= 17) return "text-green-700";
  if (v >= 13) return "text-emerald-700";
  if (v >= 10) return "text-amber-700";
  return "text-red-700";
}

export default async function ParentChildGradesPage({
  params,
}: {
  params: Promise<{ locale: string; studentId: string }>;
}) {
  const { locale, studentId } = await params;
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

  const grades = await db.grade.findMany({
    where: { studentId },
    include: { course: true },
    orderBy: [{ course: { name: "asc" } }, { period: "asc" }],
  });

  const byCourse: Record<string, { course: { name: string; code: string }; grades: typeof grades }> = {};
  for (const g of grades) {
    if (!byCourse[g.courseId]) {
      byCourse[g.courseId] = { course: g.course, grades: [] };
    }
    byCourse[g.courseId]!.grades.push(g);
  }
  const courses = Object.values(byCourse);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{student.user?.name}</h2>
        <p className="text-slate-500 text-sm mt-1">Grades · {student.group?.name ?? "No group"} · Scale 0–20</p>
      </div>

      {courses.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <BookOpen className="w-12 h-12 mb-3 opacity-30" />
          <p>No grades recorded yet</p>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Grade Report</CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Course</th>
                {PERIODS.map((p) => (
                  <th key={p} className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    {PERIOD_LABELS[p]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {courses.map(({ course, grades: cGrades }) => (
                <tr key={course.code} className="hover:bg-slate-50">
                  <td className="px-5 py-3.5">
                    <p className="font-medium text-slate-900">{course.name}</p>
                    <p className="text-xs text-slate-400 font-mono">{course.code}</p>
                  </td>
                  {PERIODS.map((period) => {
                    const g = cGrades.find((gr) => gr.period === period);
                    return (
                      <td key={period} className="px-5 py-3.5 text-center">
                        {g ? (
                          <span className={`text-lg font-bold ${gradeColor(Number(g.value))}`}>
                            {Number(g.value).toFixed(1)}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {courses.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-16 text-center text-slate-400">
                    No grades recorded
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
