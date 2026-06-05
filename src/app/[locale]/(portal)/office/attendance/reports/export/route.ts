import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { localDateStr, getNow } from "@/lib/dates";
import { summarizeByStudent, toCsv } from "@/lib/attendanceReport";
import { loadReportRows } from "@/server/attendanceReport";

// CSV export of the per-student attendance summary for the selected range.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["SCHOOL_ADMIN", "SUPER_ADMIN"].includes(session.user.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const todayStr = localDateStr();
  const fromStr = sp.get("from") ?? localDateStr(new Date(getNow().getTime() - 30 * 24 * 60 * 60 * 1000));
  const toStr = sp.get("to") ?? todayStr;
  const groupId = sp.get("groupId") ?? undefined;

  const rows = await loadReportRows(fromStr, toStr, groupId || undefined);
  const students = summarizeByStudent(rows);

  const csv = toCsv(
    ["Αρ. Μητρώου", "Μαθητής", "Τμήμα", "Ημέρες", "Απουσίες", "Αυτόματες", "Καθυστερήσεις", "Δικαιολογημένες", "Με Άδεια Εξόδου", "Διεγραμμένες"],
    students.map((s) => [
      s.studentId,
      s.studentName,
      s.groupName,
      s.days,
      s.absences,
      s.autoAbsent,
      s.late,
      s.excused,
      s.withPermit,
      s.waived,
    ])
  );

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="absences_${fromStr}_${toStr}.csv"`,
    },
  });
}
