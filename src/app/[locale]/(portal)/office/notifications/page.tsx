import { StaffNotificationsHub } from "@/components/notifications/StaffNotificationsHub";

// Same hub the teacher portal renders — the office reaches it at its own path.
export default async function OfficeNotificationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { locale } = await params;
  const { error } = await searchParams;
  return (
    <StaffNotificationsHub locale={locale} hub={`/${locale}/office/notifications`} error={error} />
  );
}
