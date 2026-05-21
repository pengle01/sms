import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScheduleImportForm } from "./import-form";

export default async function TimetableImportPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "SUPER_ADMIN") {
    redirect(`/${locale}/admin`);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link
          href={`/${locale}/admin/timetable`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to timetable
        </Link>
        <h2 className="text-2xl font-bold text-slate-900">Import schedule</h2>
        <p className="text-slate-500 text-sm mt-1">
          Upload the teacher timetable Excel exported from the ministry system.
          Slots are upserted — re-importing is safe.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Upload file</CardTitle>
        </CardHeader>
        <CardContent>
          <ScheduleImportForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-slate-700">Expected format</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-600 space-y-2">
          <p>The file must follow the standard ministry schedule export layout:</p>
          <ul className="list-disc list-inside space-y-1 text-slate-500">
            <li>Row 1–2: headers (skipped)</li>
            <li>Column A: teacher name (every other row)</li>
            <li>Columns D–AQ (indices 3–42): 5 days × 8 periods</li>
            <li>Teacher row cell: group code (e.g. <code className="font-mono bg-slate-100 px-1 rounded">ΜΟ2α</code>)</li>
            <li>Detail row cell: <code className="font-mono bg-slate-100 px-1 rounded">Room / Course name (grade)</code></li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
