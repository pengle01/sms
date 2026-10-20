import { NextRequest } from "next/server";
import { attendanceReportXlsx } from "@/server/attendanceReportExport";

// Excel export of the attendance report — management (headmaster, Β.Δ.Α.).
export async function GET(req: NextRequest, { params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return attendanceReportXlsx(req, locale);
}
