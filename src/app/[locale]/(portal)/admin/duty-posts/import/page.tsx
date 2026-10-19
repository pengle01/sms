import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { getSuperAdminAuth } from "@/server/authz";
import { DutyImportForm } from "./import-form";

export default async function DutyPostsImportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!(await getSuperAdminAuth())) redirect(`/${locale}/login/staff`);
  const t = await getTranslations("breakDuty");

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Link
          href={`/${locale}/admin/settings`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          {t("backToSettings")}
        </Link>
        <h2 className="text-2xl font-bold text-slate-900">{t("importTitle")}</h2>
        <p className="text-slate-500 text-sm mt-1 max-w-2xl">{t("importIntro")}</p>
      </div>
      <DutyImportForm />
    </div>
  );
}
