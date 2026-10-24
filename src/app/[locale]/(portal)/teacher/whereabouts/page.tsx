import { redirect } from "next/navigation";
import { getActiveAuth } from "@/server/authz";
import { canViewStaffDirectory, isEducator } from "@/lib/rbac";
import { Whereabouts, type WhereaboutsParams } from "@/components/whereabouts/Whereabouts";

/**
 * «Πού βρίσκεται;» — students now (its own route, the default), and where a
 * teacher is, which rooms are free and any group's students — every educator;
 * phones for management.
 */
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
  const query = await searchParams;
  const studentsHref = `/${locale}/teacher/whereabouts/students`;
  // The menu lands on the students tab, the one used most during the day.
  if (!query.tab) redirect(studentsHref);

  return (
    <Whereabouts
      params={query}
      showPhone={canViewStaffDirectory(auth.roles)}
      basePath={`/${locale}/teacher/whereabouts`}
      studentsHref={studentsHref}
    />
  );
}
