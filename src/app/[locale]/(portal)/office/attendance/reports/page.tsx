import { redirect } from "next/navigation";
import { getActiveAuth } from "@/server/authz";
import { canViewAttendanceReports } from "@/lib/attendanceReport";
import { AttendanceReports } from "@/components/reports/AttendanceReports";

export default async function OfficeAttendanceReportsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string; to?: string; groupId?: string }>;
}) {
  const { locale } = await params;
  const auth = await getActiveAuth();
  if (!auth || !canViewAttendanceReports(auth.roles)) redirect(`/${locale}/login/staff`);
  const sp = await searchParams;
  return <AttendanceReports exportBase={`/${locale}/office/attendance/reports/export`} {...sp} />;
}
