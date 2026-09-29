import { redirect } from "next/navigation";
import { getSuperAdminAuth } from "@/server/authz";
import { Whereabouts, type WhereaboutsParams } from "@/components/whereabouts/Whereabouts";

/** The admin's copy of the teacher/room lookup, with teachers' phones. */
export default async function AdminWhereaboutsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<WhereaboutsParams>;
}) {
  const { locale } = await params;
  const auth = await getSuperAdminAuth();
  if (!auth) redirect(`/${locale}/login/staff`);

  return <Whereabouts params={await searchParams} showPhone />;
}
