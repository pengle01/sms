import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTranslations } from "next-intl/server";
import { ReferralForm } from "./ReferralForm";

export default async function NewReferralPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login/staff`);

  const t = await getTranslations("referrals");

  // Fetch staff code name from TeacherClaim (e.g. "ΗΥ-ΕΓΓΛΕΖΑΚΗΣ Π")
  const claim = await db.teacherClaim.findUnique({
    where: { userId: session.user.id },
    select: { staffName: true },
  });
  const filerName = claim?.staffName ?? session.user.name ?? "";

  // Fetch students grouped by homegroup (include grade for cascading picker)
  const groups = await db.group.findMany({
    where: {
      students: { some: { user: { isActive: true } } },
    },
    select: {
      id: true,
      name: true,
      grade: true,
      students: {
        where: { user: { isActive: true } },
        include: { user: { select: { name: true } } },
        orderBy: { user: { name: "asc" } },
      },
    },
    orderBy: [{ grade: "asc" }, { name: "asc" }],
  });

  return (
    <div className="space-y-5 max-w-2xl">
      <Link
        href={`/${locale}/teacher/referrals`}
        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
      >
        <ArrowLeft className="w-4 h-4" />
        {t("title")}
      </Link>

      <h2 className="text-2xl font-bold text-slate-900">{t("newReferral")}</h2>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("newReferral")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ReferralForm
            groups={groups.map((g) => ({
              id: g.id,
              name: g.name,
              grade: g.grade ?? 0,
              students: g.students.map((s) => ({
                id: s.id,
                name: s.user?.name ?? "",
                studentId: s.studentId,
              })),
            }))}
            filerName={filerName}
            locale={locale}
          />
        </CardContent>
      </Card>
    </div>
  );
}
