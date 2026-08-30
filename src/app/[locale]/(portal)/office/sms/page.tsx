import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { redirect } from "next/navigation";
import { SmsLogView, type SmsLogParams } from "@/components/sms/SmsLogView";

/** The office's copy of the sent-SMS log — same read-only view as the admin's. */
export default async function OfficeSmsLogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SmsLogParams>;
}) {
  const { locale } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect(`/${locale}/login/staff`);
  if (!["SCHOOL_ADMIN", "SUPER_ADMIN"].includes(session.user.role)) {
    redirect(`/${locale}/login/staff`);
  }

  return <SmsLogView params={await searchParams} />;
}
