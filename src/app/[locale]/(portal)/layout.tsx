import { getSchoolName } from "@/lib/schoolConfig";
import { SchoolNameProvider } from "@/components/layout/SchoolNameContext";
import { TestDateBanner } from "@/components/layout/TestDateBanner";

// Shared wrapper for every portal: provides the admin-configured school name
// to client components (sidebar branding) without each portal layout having
// to fetch and thread it.
export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const schoolName = await getSchoolName();
  return (
    <SchoolNameProvider value={schoolName}>
      {/* Renders nothing unless NEXT_PUBLIC_TEST_DATE is set. */}
      <TestDateBanner />
      {children}
    </SchoolNameProvider>
  );
}
