import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { GradeReport } from "@/components/grades/GradeReport";

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
    include: { user: { select: { name: true } }, group: true },
  });
  if (!student) redirect(`/${locale}/parent/children`);

  const t = await getTranslations("grades");

  const [grades, testGrades] = await Promise.all([
    db.grade.findMany({
      where: { studentId },
      include: { course: true },
      orderBy: [{ course: { name: "asc" } }, { period: "asc" }],
    }),
    db.testGrade.findMany({
      where: { studentId, value: { not: null } },
      include: { testSchedule: { include: { course: { select: { name: true } } } } },
      orderBy: { testSchedule: { date: "desc" } },
    }),
  ]);

  return (
    <GradeReport
      heading={student.user?.name ?? t("title")}
      subheading={`${t("title")} · ${student.group?.name ?? ""} · ${t("scale")}`}
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
