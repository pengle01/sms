import { redirect } from "next/navigation";
import { getActiveAuth } from "@/server/authz";
import { canViewStaffDirectory, isOfficeAdmin } from "@/lib/rbac";
import { Whereabouts, type WhereaboutsParams } from "@/components/whereabouts/Whereabouts";

/** The office's copy of the teacher/room lookup, with teachers' phones. */
export default async function OfficeWhereaboutsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<WhereaboutsParams>;
}) {
  const { locale } = await params;
  const auth = await getActiveAuth();
  if (!auth || !isOfficeAdmin(auth.role)) redirect(`/${locale}/login/staff`);

  return <Whereabouts params={await searchParams} showPhone={canViewStaffDirectory(auth.roles)} />;
}
