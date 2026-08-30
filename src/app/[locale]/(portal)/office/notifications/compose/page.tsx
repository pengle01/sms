import { StaffComposePanel } from "@/components/notifications/StaffComposePanel";

export default async function OfficeComposeNotificationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { locale } = await params;
  const { sent, error } = await searchParams;
  return (
    <StaffComposePanel
      locale={locale}
      hub={`/${locale}/office/notifications`}
      sent={sent}
      error={error}
    />
  );
}
