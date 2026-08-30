import { redirect } from "next/navigation";
import { getActiveAuth } from "@/server/authz";
import { canViewStaffDirectory } from "@/lib/rbac";
import { StaffDirectory, type StaffDirectoryParams } from "@/components/staff/StaffDirectory";

/** The office's copy of the staff phone list — same read-only view as management's. */
export default async function OfficeDirectoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<StaffDirectoryParams>;
}) {
  const { locale } = await params;
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  if (!canViewStaffDirectory(auth.roles)) redirect(`/${locale}/office/dashboard`);

  return <StaffDirectory params={await searchParams} />;
}
