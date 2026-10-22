import { MaintenanceStats } from "@/components/maintenance/MaintenanceStats";

export default async function MaintenanceStatsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ range?: string }>;
}) {
  const { locale } = await params;
  const { range } = await searchParams;
  return <MaintenanceStats basePath={`/${locale}/teacher/maintenance`} range={range} />;
}
