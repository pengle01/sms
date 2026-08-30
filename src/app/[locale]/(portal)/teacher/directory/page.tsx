import { redirect } from "next/navigation";
import { getActiveAuth } from "@/server/authz";
import { canViewStaffDirectory } from "@/lib/rbac";
import { StaffDirectory, type StaffDirectoryParams } from "@/components/staff/StaffDirectory";

/** Management's copy of the staff phone list — same read-only view as the office's. */
export default async function TeacherDirectoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<StaffDirectoryParams>;
}) {
  const { locale } = await params;
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  // Colleagues' personal numbers — management only, not every educator.
  if (!canViewStaffDirectory(auth.roles)) redirect(`/${locale}/teacher/dashboard`);

  return <StaffDirectory params={await searchParams} />;
}
