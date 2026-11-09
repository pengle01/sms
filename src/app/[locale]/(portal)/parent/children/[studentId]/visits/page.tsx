import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { db } from "@/server/db";
import { guardianAccess } from "@/server/guardianAccess";
import { visitListForStudent } from "@/server/visitHours";
import { VisitList } from "@/components/visits/VisitList";

/** A parent's list of the teachers who teach their child, with visit hours. Not for chaperones. */
export default async function ChildVisitsPage({
  params,
}: {
  params: Promise<{ locale: string; studentId: string }>;
}) {
  const { locale, studentId } = await params;
  const { home, studentIds } = await guardianAccess(locale);
  if (home.endsWith("/chaperone/students") || !studentIds.has(studentId)) redirect(home);

  const student = await db.studentProfile.findUnique({
    where: { id: studentId },
    select: { user: { select: { name: true } }, group: { select: { name: true } } },
  });
  if (!student) redirect(home);

  const [t, tNav, rows] = await Promise.all([
    getTranslations("visitHours"),
    getTranslations("nav"),
    visitListForStudent(studentId),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <Link href={home} className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" />
          {tNav("children")}
        </Link>
        <h2 className="mt-2 text-2xl font-bold text-slate-900">{student.user?.name}</h2>
        <p className="text-slate-500 text-sm mt-1">
          {t("title")}
          {student.group?.name && ` · ${student.group.name}`}
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <VisitList rows={rows} />
      </div>
    </div>
  );
}
