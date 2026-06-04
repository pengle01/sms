import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen } from "lucide-react";
import { fmtDisplayDate } from "@/lib/dates";
import { GRADE_PERIODS, gradeColorClass } from "@/lib/grades";

export type GradeReportLabels = {
  term1: string;
  term2: string;
  course: string;
  termGrades: string;
  testGrades: string;
  noGrades: string;
  colDate: string;
  colType: string;
  colGrade: string;
  typeBig: string;
  typeSmall: string;
};

// Combined term + test grade report. Server component shared by the student and
// parent portals.
export function GradeReport({
  heading,
  subheading,
  grades,
  testGrades,
  labels,
  toolbar,
}: {
  heading: string;
  subheading: string;
  grades: Array<{ courseId: string; period: string; value: unknown; course: { name: string; code: string } }>;
  testGrades: Array<{
    id: string;
    value: unknown;
    testSchedule: { date: Date; type: "BIG" | "SMALL"; course: { name: string } };
  }>;
  labels: GradeReportLabels;
  /** Optional controls (e.g. a search form) rendered between heading and tables. */
  toolbar?: React.ReactNode;
}) {
  const byCourse: Record<string, { course: { name: string; code: string }; grades: typeof grades }> = {};
  for (const g of grades) {
    if (!byCourse[g.courseId]) byCourse[g.courseId] = { course: g.course, grades: [] };
    byCourse[g.courseId]!.grades.push(g);
  }
  const courses = Object.values(byCourse);

  const PERIOD_LABEL: Record<string, string> = {
    TERM1: labels.term1,
    TERM2: labels.term2,
  };

  const hasAny = courses.length > 0 || testGrades.length > 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{heading}</h2>
        <p className="text-slate-500 text-sm mt-1">{subheading}</p>
      </div>

      {toolbar}

      {!hasAny && (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400">
          <BookOpen className="w-12 h-12 mb-3 opacity-30" />
          <p>{labels.noGrades}</p>
        </div>
      )}

      {courses.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{labels.termGrades}</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[500px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{labels.course}</th>
                  {GRADE_PERIODS.map((p) => (
                    <th key={p} className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      {PERIOD_LABEL[p]}
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
                    {GRADE_PERIODS.map((period) => {
                      const g = cGrades.find((gr) => gr.period === period);
                      return (
                        <td key={period} className="px-5 py-3.5 text-center">
                          {g ? (
                            <span className={`text-lg font-bold ${gradeColorClass(Number(g.value))}`}>
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
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {testGrades.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{labels.testGrades}</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm min-w-[460px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{labels.colDate}</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{labels.course}</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{labels.colType}</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">{labels.colGrade}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {testGrades.map((tg) => (
                  <tr key={tg.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3.5 font-medium text-slate-900">{fmtDisplayDate(tg.testSchedule.date)}</td>
                    <td className="px-5 py-3.5 text-slate-700">{tg.testSchedule.course.name}</td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">
                      {tg.testSchedule.type === "BIG" ? labels.typeBig : labels.typeSmall}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className={`text-base font-bold ${gradeColorClass(Number(tg.value))}`}>
                        {Number(tg.value).toFixed(1)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
