import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { getTranslations } from "next-intl/server";
import { getActiveAuth } from "@/server/authz";
import { localDateStr, getNow } from "@/lib/dates";
import { summarizeByStudent, summarizeByGroup, canViewAttendanceReports } from "@/lib/attendanceReport";
import { loadReportRows } from "@/server/attendanceReport";

/**
 * The attendance report for the selected range as an Excel workbook: a sheet
 * per student and a sheet per group. Used by the office's and management's
 * export routes (same access rule as the page).
 */
export async function attendanceReportXlsx(req: NextRequest, locale: string): Promise<NextResponse> {
  const auth = await getActiveAuth();
  if (!auth || !canViewAttendanceReports(auth.roles)) return new NextResponse("Forbidden", { status: 403 });
  // Explicit locale: a route handler has no rendered page to infer it from.
  const t = await getTranslations({ locale, namespace: "officeReports" });

  const sp = req.nextUrl.searchParams;
  const toStr = sp.get("to") ?? localDateStr();
  const fromStr = sp.get("from") ?? localDateStr(new Date(getNow().getTime() - 30 * 24 * 60 * 60 * 1000));
  const groupId = sp.get("groupId") || undefined;

  const rows = await loadReportRows(fromStr, toStr, groupId);
  const students = summarizeByStudent(rows);
  const groups = summarizeByGroup(rows);

  const wb = XLSX.utils.book_new();
  const studentSheet = XLSX.utils.aoa_to_sheet([
    [t("colId"), t("colStudent"), t("colGroup"), t("colDays"), t("colAbsences"), t("colAuto"), t("colLate"), t("colPermit"), t("colWaived")],
    ...students.map((s) => [s.studentId, s.studentName, s.groupName, s.days, s.absences, s.autoAbsent, s.late, s.withPermit, s.waived]),
  ]);
  studentSheet["!cols"] = [{ wch: 12 }, { wch: 32 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, studentSheet, t("sheetStudents"));

  const groupSheet = XLSX.utils.aoa_to_sheet([
    [t("colGroup"), t("colStudents"), t("colAbsences"), t("colLate"), t("colPermit")],
    ...groups.map((g) => [g.groupName ?? "—", g.students, g.absences, g.late, g.withPermit]),
  ]);
  groupSheet["!cols"] = [{ wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, groupSheet, t("sheetGroups"));

  // type "array" yields an ArrayBuffer (wrap it — see the special-ed export).
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new NextResponse(new Blob([new Uint8Array(buf)]), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="absences_${fromStr}_${toStr}.xlsx"`,
    },
  });
}
