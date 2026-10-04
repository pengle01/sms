// Who took an absence, and in what capacity — for the secretary's views
// (Απουσίες table, student absences, CSV). Pure; unit-tested in
// attendanceMarker.test.ts.

import type { Role } from "@/generated/prisma/enums";

/** How the register was taken when it wasn't the lesson's own teacher. */
export type MarkKind = "COVER" | "SWAP" | "STUDY_HALL" | "CLAIM" | "HOMEGROUP_COVER";

/** Management tag shown next to the marker's name (Δ. / Β.Δ.Α. / Β.Δ.), else null. */
export function managementTag(role: Role | null | undefined): "HEADMASTER" | "HEADTEACHER_A" | "HEADTEACHER_B" | null {
  return role === "HEADMASTER" || role === "HEADTEACHER_A" || role === "HEADTEACHER_B" ? role : null;
}

/** The kind of register a row came from when it has no timetable lesson. */
export type RegisterLabel = "lesson" | "homegroupPeriod" | "excursion";

export function registerLabel(o: { hasSlot: boolean; dayType: string | null | undefined }): RegisterLabel {
  if (o.hasSlot) return "lesson";
  return o.dayType === "EXCURSION" ? "excursion" : "homegroupPeriod";
}

/**
 * How the marker took this register, or null when it was their own:
 *   • a lesson marked by someone else → the substitution kind (planned
 *     COVER/SWAP/STUDY_HALL) or an ad-hoc CLAIM;
 *   • a homegroup register marked by someone other than the homegroup's
 *     teacher, deputy or counselor → HOMEGROUP_COVER.
 */
export function markKind(o: {
  markerStaffId: string;
  slotStaffId: string | null;
  plannedKind: "COVER" | "SWAP" | "STUDY_HALL" | null;
  homegroupStaffIds: (string | null)[] | null;
}): MarkKind | null {
  if (o.homegroupStaffIds) return o.homegroupStaffIds.includes(o.markerStaffId) ? null : "HOMEGROUP_COVER";
  if (!o.slotStaffId || o.slotStaffId === o.markerStaffId) return null;
  return o.plannedKind ?? "CLAIM";
}
