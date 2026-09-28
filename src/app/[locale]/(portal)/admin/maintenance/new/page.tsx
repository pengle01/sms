import { NewRequestView } from "@/components/maintenance/NewRequestView";

export default async function NewMaintenanceRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ room?: string }>;
}) {
  const { locale } = await params;
  const { room } = await searchParams;
  return <NewRequestView basePath={`/${locale}/admin/maintenance`} room={room} />;
}
