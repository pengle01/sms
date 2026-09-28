import { MaintenanceDetail } from "@/components/maintenance/MaintenanceDetail";
import { pickQueryString } from "@/lib/listFilters";
import { MAINTENANCE_KEYS } from "@/lib/maintenance";

export default async function MaintenanceRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale, id } = await params;
  return (
    <MaintenanceDetail
      basePath={`/${locale}/teacher/maintenance`}
      id={id}
      backQuery={pickQueryString(await searchParams, MAINTENANCE_KEYS)}
    />
  );
}
