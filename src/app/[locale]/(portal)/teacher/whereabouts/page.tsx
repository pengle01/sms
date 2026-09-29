import { redirect } from "next/navigation";
import { getActiveAuth } from "@/server/authz";
import { canViewStaffDirectory, isEducator } from "@/lib/rbac";
import { Whereabouts, type WhereaboutsParams } from "@/components/whereabouts/Whereabouts";

/** Where a teacher is and which rooms are free — every educator; phones for management. */
export default async function TeacherWhereaboutsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<WhereaboutsParams>;
}) {
  const { locale } = await params;
  const auth = await getActiveAuth();
  if (!auth || !isEducator(auth.role)) redirect(`/${locale}/login/staff`);

  return <Whereabouts params={await searchParams} showPhone={canViewStaffDirectory(auth.roles)} />;
}
