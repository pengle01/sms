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
  if (!session) redirect(`/${locale}/login`);

  const t = await getTranslations("referrals");

  const students = await db.studentProfile.findMany({
    where: { user: { isActive: true } },
    include: {
      user: { select: { name: true } },
      group: { select: { name: true } },
    },
    orderBy: [{ group: { name: "asc" } }, { user: { name: "asc" } }],
  });

  const filerName = session.user.name ?? "";

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
            students={students.map((s) => ({
              id: s.id,
              name: s.user?.name ?? "",
              studentId: s.studentId,
              groupName: s.group?.name ?? "",
            }))}
            filerName={filerName}
            locale={locale}
          />
        </CardContent>
      </Card>
    </div>
  );
}
