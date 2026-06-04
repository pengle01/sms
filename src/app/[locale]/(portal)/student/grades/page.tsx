import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { GradeReport } from "@/components/grades/GradeReport";
import { matchesSearch, suggestionList } from "@/lib/textSearch";
import { Search } from "lucide-react";
import { SuggestInput } from "@/components/SuggestInput";

export default async function StudentGradesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { locale } = await params;
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login`);

  const student = await db.studentProfile.findUnique({
    where: { userId: session.user.id },
    include: { group: true },
  });
  if (!student) redirect(`/${locale}/login`);

  const t = await getTranslations("grades");

  const [grades, testGrades] = await Promise.all([
    db.grade.findMany({
      where: { studentId: student.id },
      include: { course: true },
      orderBy: [{ course: { name: "asc" } }, { period: "asc" }],
    }),
    db.testGrade.findMany({
      where: { studentId: student.id, value: { not: null } },
      include: { testSchedule: { include: { course: { select: { name: true } } } } },
      orderBy: { testSchedule: { date: "desc" } },
    }),
  ]);

  const suggestions = suggestionList([
    ...grades.map((g) => g.course.name),
    ...testGrades.map((tg) => tg.testSchedule.course.name),
  ]);
  const visibleGrades = grades.filter((g) => matchesSearch(g.course.name, query));
  const visibleTestGrades = testGrades.filter((tg) =>
    matchesSearch(tg.testSchedule.course.name, query)
  );

  return (
    <GradeReport
      heading={t("myGrades")}
      subheading={`${student.group?.name ?? ""} · ${t("scale")}`}
      toolbar={
        <form method="GET" className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-48 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <SuggestInput
              name="q"
              defaultValue={query}
              placeholder={t("searchCourse")}
              suggestions={suggestions}
              className="w-full h-9 pl-9 pr-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </form>
      }
      grades={visibleGrades}
      testGrades={visibleTestGrades}
      labels={{
        term1: t("term1"),
        term2: t("term2"),
        course: t("course"),
        termGrades: t("termGrades"),
        testGrades: t("testGrades"),
        noGrades: t("noGrades"),
        colDate: t("colDate"),
        colType: t("colType"),
        colGrade: t("colGrade"),
        typeBig: t("typeBig"),
        typeSmall: t("typeSmall"),
      }}
    />
  );
}
