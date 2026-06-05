import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { utcMidnight, toAppTimeline, fromAppTimeline } from "@/lib/dates";
import { toCsv } from "@/lib/attendanceReport";
import { substitutionKinds } from "@/server/attendanceReport";

// Downloads one day's absence log as CSV and records the download, so the
// office always knows which days were already taken and whether rows were
// added afterwards.
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !["SCHOOL_ADMIN", "SUPER_ADMIN"].includes(session.user.role)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const dateStr = sp.get("date");
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return new NextResponse("Bad date", { status: 400 });
  }
  const groupId = sp.get("groupId") || null;
  const date = utcMidnight(dateStr);

  // The file contains what was FILED on this day (matching the log page);
  // retroactive rows carry the attendance date they refer to.
  const filingDay = (d: Date) => toAppTimeline(d).toLocaleDateString("en-CA", { timeZone: "Asia/Nicosia" });
  const rowsRaw = await db.attendance.findMany({
    where: {
      createdAt: {
        gte: new Date(fromAppTimeline(date).getTime() - 24 * 60 * 60 * 1000),
        lt: new Date(fromAppTimeline(date).getTime() + 48 * 60 * 60 * 1000),
      },
      OR: [{ status: "ABSENT" }, { status: "LATE" }, { isAutoAbsent: true }],
      ...(groupId ? { student: { groupId } } : {}),
    },
    include: {
      student: { include: { user: { select: { name: true } }, group: { select: { name: true } } } },
      timetableSlot: { include: { course: { select: { name: true } } } },
      staff: { select: { scheduleName: true, user: { select: { name: true } } } },
      exitPermit: { select: { reason: true } },
    },
    orderBy: [{ date: "asc" }, { student: { user: { name: "asc" } } }, { timetableSlot: { period: "asc" } }],
  });
  const rows = rowsRaw.filter((a) => filingDay(a.createdAt) === dateStr);

  const subKinds = await substitutionKinds(
    rows.map((a) => ({
      date: a.date,
      timetableSlotId: a.timetableSlotId,
      markerStaffId: a.staffId,
      slotStaffId: a.timetableSlot?.staffId ?? null,
    }))
  );
  const subLabel = (a: (typeof rows)[number]) => {
    const kind = a.timetableSlotId
      ? subKinds.get(`${a.date.toISOString().slice(0, 10)}:${a.timetableSlotId}`)
      : undefined;
    if (!kind) return "";
    return kind === "STUDY_HALL" ? "Φ/δι ΒΔ" : kind === "CLAIM" ? "Κάλυψη" : "Αναπλήρωση";
  };

  const csv = toCsv(
    ["Ημ. Καταχώρησης", "Ημ. Απουσίας", "Άλλη Ημέρα", "Αρ. Μητρώου", "Μαθητής", "Τμήμα", "Περίοδος", "Μάθημα", "Κατάσταση", "Αυτόματη", "Καθυστέρηση (λεπτά)", "Άδεια Εξόδου", "Καθηγητής", "Αναπλήρωση", "Διεγραμμένη", "SMS"],
    rows.map((a) => [
      dateStr,
      a.date.toISOString().slice(0, 10),
      a.date.toISOString().slice(0, 10) !== dateStr ? "Ναι" : "",
      a.student.studentId,
      a.student.user?.name ?? "",
      a.student.group?.name ?? "",
      a.timetableSlot?.period ?? a.intercalaryPeriod ?? "",
      a.timetableSlot?.course.name ?? "",
      a.status === "ABSENT" ? "Απουσία" : a.status === "LATE" ? "Καθυστέρηση" : a.status,
      a.isAutoAbsent ? "Ναι" : "",
      a.minutesDelayed > 0 ? a.minutesDelayed : "",
      a.exitPermit ? a.exitPermit.reason : "",
      a.staff.scheduleName ?? a.staff.user?.name ?? "",
      subLabel(a),
      a.waived ? "Ναι" : "",
      a.smsSent ? "Ναι" : "",
    ])
  );

  // The download record: which day, by whom, how many rows the file held
  await db.attendanceExport.create({
    data: { date, groupId, userId: session.user.id, records: rows.length },
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="absences_${dateStr}.csv"`,
    },
  });
}
