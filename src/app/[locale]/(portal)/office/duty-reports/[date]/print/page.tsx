import { BreakDutyPrintPage } from "@/components/breakDuty/BreakDutyPrintPage";

/** The office's print of a day's break-duty report (the office layout gates the portal). */
export default async function OfficeBreakReportPrint({ params }: { params: Promise<{ locale: string; date: string }> }) {
  const { locale, date } = await params;
  return <BreakDutyPrintPage date={date} backHref={`/${locale}/office/duty-reports?date=${date}`} />;
}
