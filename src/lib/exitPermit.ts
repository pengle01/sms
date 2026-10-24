// Άδεια Εξόδου (Exit Permit) — pure helpers, no DB imports.
//
// A permit is issued by the day's on-duty deputy and covers the student from
// `fromPeriod` to the end of that school day. The teacher still marks the
// student ABSENT; the attendance record links to the permit so the office
// admin can see the absence was covered (yellow in attendance views).

import { isSmsPlaceholder, isHomePhone } from "./smsContacts";

export interface PermitWindow {
  date: Date;
  fromPeriod: number;
  active: boolean;
}

/** Greek labels for ParentRole (matches the referrals contact dialog). */
export const PARENT_ROLE_EL: Record<string, string> = {
  FATHER: "Πατέρας",
  MOTHER: "Μητέρα",
  GUARDIAN: "Κηδεμόνας",
  OTHER: "Άλλο",
};

/** A contact's name as shown to staff: the import's «SMS» contact reads
 *  «Αριθμός SMS»; everything else (a parent, «Τηλέφωνο οικίας», a nameless
 *  parent stored as «Πατέρας») shows its stored name. */
export function contactDisplayName(c: { name: string; role: string }): string {
  return isSmsPlaceholder(c) ? "Αριθμός SMS" : c.name;
}

/** Is the role worth showing next to the name? Not when the name already says
 *  what it is (the SMS/home numbers, or a nameless parent named by the role). */
export function showsContactRole(c: { name: string; role: string }): boolean {
  return !isSmsPlaceholder(c) && !isHomePhone(c) && c.name.trim() !== PARENT_ROLE_EL[c.role];
}

/** What a permit records when the deputy reached a parent's app-account phone:
 *  «Όνομα (Μητέρα) · 99123456», kept as the permit's contact note. */
export function permitAccountNote(a: { name: string; role: string; phone: string }): string {
  return `${a.name.trim()} (${PARENT_ROLE_EL[a.role] ?? a.role}) · ${a.phone}`;
}

/**
 * Display label for who the deputy spoke with: the picked contact (name, role,
 * phone), falling back to the free-text note for students without contacts.
 */
export function permitContactLabel(
  smsContact: { name: string; role: string; phone: string } | null | undefined,
  contactNote: string | null | undefined
): string | null {
  if (smsContact) {
    const role = showsContactRole(smsContact) ? ` (${PARENT_ROLE_EL[smsContact.role] ?? smsContact.role})` : "";
    return `${contactDisplayName(smsContact)}${role} · ${smsContact.phone}`;
  }
  const note = contactNote?.trim();
  return note ? note : null;
}

/** Same UTC school day? (all date-only values are UTC midnight — see utcMidnight) */
function sameDay(a: Date, b: Date): boolean {
  return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
}

/** Whether an active permit covers the given date + period. */
export function permitCoversPeriod(
  permit: PermitWindow,
  date: Date,
  period: number
): boolean {
  return permit.active && sameDay(permit.date, date) && period >= permit.fromPeriod;
}

/**
 * One slot per period for pre-marking a permit's absences: where a homegroup
 * slot and a subject-group slot share a period, the subject-group slot wins
 * (same precedence as the student schedule grid).
 */
export function permitAbsenceSlots<T extends { id: string; groupId: string; period: number }>(
  slots: T[],
  homegroupId: string | null | undefined
): T[] {
  const byPeriod = new Map<number, T>();
  for (const s of slots) {
    const cur = byPeriod.get(s.period);
    if (!cur || (cur.groupId === homegroupId && s.groupId !== homegroupId)) {
      byPeriod.set(s.period, s);
    }
  }
  return [...byPeriod.values()].sort((a, b) => a.period - b.period);
}

/**
 * Map studentId → covering permit for one (date, period) marking session.
 * If a student somehow has several covering permits, the earliest-leaving wins.
 */
export function permitByStudent<T extends PermitWindow & { studentId: string }>(
  permits: T[],
  date: Date,
  period: number
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const p of permits) {
    if (!permitCoversPeriod(p, date, period)) continue;
    const existing = out[p.studentId];
    if (!existing || p.fromPeriod < existing.fromPeriod) out[p.studentId] = p;
  }
  return out;
}
