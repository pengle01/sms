import { redirect } from "next/navigation";
import { getActiveAuth } from "@/server/authz";
import { canViewDutyDesk } from "@/lib/dutyRoster";
import { BreakDutyPrintPage } from "@/components/breakDuty/BreakDutyPrintPage";

/** The day's break-duty report from the duty desk (deputies and the headmaster). */
export default async function DutyBreakReportPrint({ params }: { params: Promise<{ locale: string; date: string }> }) {
  const { locale, date } = await params;
  const auth = await getActiveAuth();
  if (!auth) redirect(`/${locale}/login/staff`);
  if (!canViewDutyDesk(auth.role)) redirect(`/${locale}/teacher/dashboard`);
  return <BreakDutyPrintPage date={date} backHref={`/${locale}/teacher/duty?view=breakDuty&day=${date}`} />;
}
