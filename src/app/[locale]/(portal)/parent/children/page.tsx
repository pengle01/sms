import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { GraduationCap } from "lucide-react";
import { GuardianStudentCards } from "@/components/guardian/GuardianStudentCards";

export default async function ParentChildrenPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations("parentChildren");
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login/parent`);

  const parent = await db.parentProfile.findUnique({
    where: { userId: session.user.id },
    select: { children: { select: { studentProfileId: true } } },
  });

  if (!parent) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <GraduationCap className="w-12 h-12 mb-3 opacity-30" />
        <p>{t("noneLinked")}</p>
        <p className="text-sm mt-1">{t("noneLinkedHint")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
        <p className="text-slate-500 text-sm mt-1">{t("enrolled", { count: parent.children.length })}</p>
      </div>
      <GuardianStudentCards
        locale={locale}
        studentIds={parent.children.map((c) => c.studentProfileId)}
        basePath={`/${locale}/parent/children`}
      />
    </div>
  );
}
