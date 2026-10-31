import { db } from "@/server/db";
import { guardianAccess } from "@/server/guardianAccess";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { GradeReport } from "@/components/grades/GradeReport";

export default async function ParentChildGradesPage({
  params,
}: {
  params: Promise<{ locale: string; studentId: string }>;
}) {
  const { locale, studentId } = await params;
  // A parent's linked child, or a chaperone's approved student — shared by
  // both portals (the chaperone routes re-export this page).
  const { home, studentIds } = await guardianAccess(locale);
  if (!studentIds.has(studentId)) redirect(home);

  const student = await db.studentProfile.findUnique({
    where: { id: studentId },
    include: { user: { select: { name: true } }, group: true },
  });
  if (!student) redirect(home);

  const t = await getTranslations("grades");

  // Term marks only — test marks live on the child's Tests page.
  const grades = await db.grade.findMany({
    where: { studentId },
    include: { course: true },
    orderBy: [{ course: { name: "asc" } }, { period: "asc" }],
  });

  return (
    <GradeReport
      heading={student.user?.name ?? t("title")}
      subheading={`${t("title")} · ${student.group?.name ?? ""}`}
      grades={grades}
      testGrades={[]}
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
