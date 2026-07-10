import { getSuperAdminAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScheduleImportForm } from "./import-form";

export default async function TimetableImportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const auth = await getSuperAdminAuth();
  if (!auth) {
    redirect(`/${locale}/admin`);
  }

  const t = await getTranslations("adminTimetable");
  const code = (chunks: React.ReactNode) => (
    <code className="font-mono bg-slate-100 px-1 rounded">{chunks}</code>
  );

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link
          href={`/${locale}/admin/timetable`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          {t("backToTimetable")}
        </Link>
        <h2 className="text-2xl font-bold text-slate-900">{t("importTitle")}</h2>
        <p className="text-slate-500 text-sm mt-1">
          {t("importSubtitle")}
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("uploadFile")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ScheduleImportForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-700">{t("expectedFormat")}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600 space-y-2">
          <p>{t("formatIntro")}</p>
          <ul className="list-disc list-inside space-y-1 text-slate-500">
            <li>{t("formatRows")}</li>
            <li>{t("formatColA")}</li>
            <li>{t("formatCols")}</li>
            <li>{t.rich("formatTeacherRow", { code })}</li>
            <li>{t.rich("formatDetailRow", { code })}</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
