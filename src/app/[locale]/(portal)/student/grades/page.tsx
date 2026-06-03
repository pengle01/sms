import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { GradeReport } from "@/components/grades/GradeReport";

export default async function StudentGradesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
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

  return (
    <GradeReport
      heading={t("myGrades")}
      subheading={`${student.group?.name ?? ""} · ${t("scale")}`}
      grades={grades}
      testGrades={testGrades}
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
