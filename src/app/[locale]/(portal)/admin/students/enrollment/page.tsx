import { getSuperAdminAuth } from "@/server/authz";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EnrollmentImportForm } from "./import-form";

export default async function EnrollmentImportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const auth = await getSuperAdminAuth();
  if (!auth) {
    redirect(`/${locale}/admin`);
  }

  const t = await getTranslations("adminStudents");

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link
          href={`/${locale}/admin/students`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          {t("backToStudents")}
        </Link>
        <h2 className="text-2xl font-bold text-slate-900">{t("enrollTitle")}</h2>
        <p className="text-slate-500 text-sm mt-1">
          {t("enrollIntro")}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("enrollUploadFile")}</CardTitle>
        </CardHeader>
        <CardContent>
          <EnrollmentImportForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-700">{t("enrollExpectedFormat")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600 space-y-2">
          <p>{t("enrollFormatIntro")}</p>
          <ul className="list-disc list-inside space-y-1 text-slate-500">
            <li>{t("enrollFormatRow1")}</li>
            <li>{t("enrollFormatColA")}</li>
            <li>{t("enrollFormatColB")}</li>
            <li>{t("enrollFormatColE")}</li>
            <li>{t("enrollFormatColF")}</li>
          </ul>
          <p className="text-slate-400 text-xs pt-1">
            {t("enrollNotFoundNote")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
