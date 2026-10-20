import { redirect } from "next/navigation";
import { getActiveAuth } from "@/server/authz";
import { canViewAttendanceReports } from "@/lib/attendanceReport";
import { AttendanceReports } from "@/components/reports/AttendanceReports";

/** The office's attendance reports, for the headmaster and the Β.Δ.Α. */
export default async function TeacherAttendanceReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; to?: string; groupId?: string }>;
}) {
  const { locale } = await params;
  const auth = await getActiveAuth();
  if (!auth || !canViewAttendanceReports(auth.roles)) redirect(`/${locale}/teacher/dashboard`);
  const sp = await searchParams;
  return <AttendanceReports exportBase={`/${locale}/teacher/reports/export`} {...sp} />;
}
