import { MaintenanceList, type MaintenanceListParams } from "@/components/maintenance/MaintenanceList";

export default async function MaintenancePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<MaintenanceListParams>;
}) {
  const { locale } = await params;
  return <MaintenanceList basePath={`/${locale}/office/maintenance`} params={await searchParams} />;
}
