import { getTranslations } from "next-intl/server";

export default async function TeacherReferralsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  void (await params);
  const t = await getTranslations("referrals");
  const tCommon = await getTranslations("common");

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-slate-900">{t("title")}</h2>
      <p className="text-slate-400 text-sm">{tCommon("comingSoon")}</p>
    </div>
  );
}
