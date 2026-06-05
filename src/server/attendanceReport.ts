import { db } from "@/server/db";
import { utcMidnight } from "@/lib/dates";
import type { ReportRow } from "@/lib/attendanceReport";

/** Loads the non-present attendance rows for a date range (and optional group),
 *  shaped for the pure summarizers — shared by the reports page and the CSV export. */
export async function loadReportRows(
  fromStr: string,
  toStr: string,
  groupId?: string
): Promise<ReportRow[]> {
  const rows = await db.attendance.findMany({
    where: {
      date: { gte: utcMidnight(fromStr), lte: utcMidnight(toStr) },
      status: { in: ["ABSENT", "LATE", "EXCUSED"] },
      ...(groupId ? { student: { groupId } } : {}),
    },
    select: {
      date: true,
      status: true,
      isAutoAbsent: true,
      exitPermitId: true,
      intercalaryPeriod: true,
      waived: true,
      timetableSlot: { select: { period: true } },
      student: {
        select: {
          id: true,
          studentId: true,
          user: { select: { name: true } },
          group: { select: { id: true, name: true } },
        },
      },
    },
  });

  return rows.map((r) => ({
    studentProfileId: r.student.id,
    studentName: r.student.user?.name ?? "—",
    studentId: r.student.studentId,
    groupId: r.student.group?.id ?? null,
    groupName: r.student.group?.name ?? null,
    date: r.date.toISOString().slice(0, 10),
    period: r.timetableSlot?.period ?? r.intercalaryPeriod ?? null,
    status: r.status,
    isAutoAbsent: r.isAutoAbsent,
    hasExitPermit: r.exitPermitId !== null,
    waived: r.waived,
  }));
}

/** For attendance rows marked by someone other than the slot's own teacher,
 *  resolves WHAT the cover was: a planned substitution (COVER/SWAP, by a
 *  teacher), a study hall (STUDY_HALL, by a headteacher) or an ad-hoc claim.
 *  Keyed `${dateISO}:${timetableSlotId}`. */
export async function substitutionKinds(
  rows: { date: Date; timetableSlotId: string | null; markerStaffId: string; slotStaffId: string | null }[]
): Promise<Map<string, "COVER" | "SWAP" | "STUDY_HALL" | "CLAIM">> {
  const covered = rows.filter(
    (r) => r.timetableSlotId && r.slotStaffId && r.markerStaffId !== r.slotStaffId
  );
  const result = new Map<string, "COVER" | "SWAP" | "STUDY_HALL" | "CLAIM">();
  if (covered.length === 0) return result;

  const dates = [...new Set(covered.map((r) => r.date.toISOString()))].map((d) => new Date(d));
  const slotIds = [...new Set(covered.map((r) => r.timetableSlotId!))];
  const entries = await db.substitutionPlanEntry.findMany({
    where: {
      plan: { status: "FINAL", date: { in: dates } },
      timetableSlotId: { in: slotIds },
      kind: { in: ["COVER", "SWAP", "STUDY_HALL"] },
    },
    select: { timetableSlotId: true, kind: true, plan: { select: { date: true } } },
  });
  const planned = new Map<string, "COVER" | "SWAP" | "STUDY_HALL">();
  for (const e of entries) {
    planned.set(
      `${e.plan.date.toISOString().slice(0, 10)}:${e.timetableSlotId}`,
      e.kind as "COVER" | "SWAP" | "STUDY_HALL"
    );
  }
  for (const r of covered) {
    const key = `${r.date.toISOString().slice(0, 10)}:${r.timetableSlotId}`;
    result.set(key, planned.get(key) ?? "CLAIM");
  }
  return result;
}
