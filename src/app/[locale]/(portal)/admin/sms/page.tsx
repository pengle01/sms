import { getSuperAdminAuth } from "@/server/authz";
import { redirect } from "next/navigation";
import { SmsLogView, type SmsLogParams } from "@/components/sms/SmsLogView";

/** The admin's copy of the sent-SMS log — same read-only view as the office's. */
export default async function AdminSmsLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SmsLogParams>;
}) {
  const { locale } = await params;
  const auth = await getSuperAdminAuth();
  if (!auth) redirect(`/${locale}/login/staff`);

  return <SmsLogView params={await searchParams} />;
}
