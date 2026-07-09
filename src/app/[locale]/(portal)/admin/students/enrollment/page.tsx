import { getSuperAdminAuth } from "@/server/authz";
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

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link
          href={`/${locale}/admin/students`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to students
        </Link>
        <h2 className="text-2xl font-bold text-slate-900">Import student enrollment</h2>
        <p className="text-slate-500 text-sm mt-1">
          Assigns each student to their subject groups. Re-importing syncs each
          student to their row — groups in the file are added, ones no longer
          listed are removed. Only groups the file mentions are ever removed:
          assignments made by hand to groups outside the file are kept. (A row
          with an unrecognised group code is added-only, never cleared, so a
          typo can't drop enrollments.)
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Upload file</CardTitle>
        </CardHeader>
        <CardContent>
          <EnrollmentImportForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-700">Expected format</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600 space-y-2">
          <p>The file must follow the standard ministry enrollment export layout:</p>
          <ul className="list-disc list-inside space-y-1 text-slate-500">
            <li>Row 1: headers (skipped)</li>
            <li>Column A: student name</li>
            <li>Column B: registry number (ΑΡ.ΜΗΤ.) — used to match the student</li>
            <li>Column E: homeroom class (Νέο Τμήμα)</li>
            <li>Columns F onwards: subject group codes</li>
          </ul>
          <p className="text-slate-400 text-xs pt-1">
            Students not found by registry number are reported as warnings and skipped.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
