import { db } from "@/server/db";
import { utcMidnight } from "@/lib/dates";
import type { ReportRow } from "@/lib/attendanceReport";
import type { Role } from "@/generated/prisma/enums";
import { getSpecialDaysInRange } from "@/lib/calendar";
import { effectiveStaffRole } from "@/lib/staffRole";
import { managementTag, markKind, registerLabel, type MarkKind, type RegisterLabel } from "@/lib/attendanceMarker";

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
      status: { in: ["ABSENT", "LATE"] },
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

/** Prisma include for the fields `markerDetails` needs on an Attendance row. */
export const MARKER_INCLUDE = {
  staff: { select: { id: true, scheduleName: true, plannedRole: true, user: { select: { name: true, role: true } } } },
  timetableSlot: {
    include: {
      course: { select: { name: true } },
      staff: { select: { scheduleName: true, user: { select: { name: true } } } },
    },
  },
} as const;

type MarkerSource = {
  id: string;
  date: Date;
  staffId: string;
  timetableSlotId: string | null;
  intercalaryGroupId: string | null;
  staff: { scheduleName: string | null; plannedRole: Role | null; user: { name: string | null; role: Role } | null };
  timetableSlot: {
    staffId: string | null;
    staffName: string | null;
    course: { name: string };
    staff: { scheduleName: string | null; user: { name: string | null } | null } | null;
  } | null;
};

export interface MarkerDetail {
  /** Course name, or the homegroup register's kind. */
  lesson: RegisterLabel;
  courseName: string | null;
  marker: string;
  /** Δ. / Β.Δ.Α. / Β.Δ. when the marker is management. */
  tag: "HEADMASTER" | "HEADTEACHER_A" | "HEADTEACHER_B" | null;
  /** Taken in someone else's place: how, and whose lesson it was. */
  kind: MarkKind | null;
  lessonTeacher: string | null;
}

/**
 * For each attendance row: which lesson/register it came from, who took it
 * (with a management tag) and — when it wasn't the lesson's own teacher — in
 * what capacity and in whose place. Keyed by attendance id.
 */
export async function markerDetails(rows: MarkerSource[]): Promise<Map<string, MarkerDetail>> {
  const out = new Map<string, MarkerDetail>();
  if (rows.length === 0) return out;

  const planned = await substitutionKinds(
    rows.map((a) => ({
      date: a.date,
      timetableSlotId: a.timetableSlotId,
      markerStaffId: a.staffId,
      slotStaffId: a.timetableSlot?.staffId ?? null,
    })),
  );

  const homegroupIds = [...new Set(rows.map((r) => r.intercalaryGroupId).filter((x): x is string => !!x))];
  const hgRows = homegroupIds.length
    ? await db.group.findMany({
        where: { id: { in: homegroupIds } },
        select: { id: true, homeroomTeacherId: true, homeroomHeadteacherId: true, counselorId: true },
      })
    : [];
  const homegroupStaff = new Map(hgRows.map((g) => [g.id, [g.homeroomTeacherId, g.homeroomHeadteacherId, g.counselorId]]));

  // Day types of homegroup registers' dates (homegroup period vs excursion)
  const dayType = new Map<string, string>();
  const hgDates = rows.filter((r) => !r.timetableSlotId).map((r) => r.date.getTime());
  if (hgDates.length) {
    const specials = await getSpecialDaysInRange(new Date(Math.min(...hgDates)), new Date(Math.max(...hgDates)));
    for (const r of rows) {
      if (r.timetableSlotId) continue;
      const sd = specials.find((s) => s.startDate <= r.date && s.endDate >= r.date);
      if (sd) dayType.set(r.id, sd.type);
    }
  }

  for (const a of rows) {
    const slot = a.timetableSlot;
    const p = planned.get(`${a.date.toISOString().slice(0, 10)}:${a.timetableSlotId}`);
    const kind = markKind({
      markerStaffId: a.staffId,
      slotStaffId: slot?.staffId ?? null,
      plannedKind: p && p !== "CLAIM" ? p : null,
      homegroupStaffIds: a.intercalaryGroupId ? homegroupStaff.get(a.intercalaryGroupId) ?? [] : null,
    });
    out.set(a.id, {
      lesson: registerLabel({ hasSlot: !!slot, dayType: dayType.get(a.id) }),
      courseName: slot?.course.name ?? null,
      marker: a.staff.scheduleName ?? a.staff.user?.name ?? "—",
      tag: managementTag(
        effectiveStaffRole({ accountRole: a.staff.user?.role, plannedRole: a.staff.plannedRole, scheduleName: a.staff.scheduleName }),
      ),
      kind,
      lessonTeacher: kind && slot ? slot.staff?.scheduleName ?? slot.staffName ?? slot.staff?.user?.name ?? null : null,
    });
  }
  return out;
}
