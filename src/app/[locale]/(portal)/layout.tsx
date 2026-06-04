import { getSchoolName } from "@/lib/schoolConfig";
import { SchoolNameProvider } from "@/components/layout/SchoolNameContext";

// Shared wrapper for every portal: provides the admin-configured school name
// to client components (sidebar branding) without each portal layout having
// to fetch and thread it.
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const schoolName = await getSchoolName();
  return <SchoolNameProvider value={schoolName}>{children}</SchoolNameProvider>;
}
