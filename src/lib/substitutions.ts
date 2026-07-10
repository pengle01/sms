// Αναπληρώσεις (substitutions) — the pure selection engine, ported from the
// legacy SQL `sp_ProcessDailyAbsences`. No DB or framework imports: everything
// operates on plain data so each rule is unit-testable.
//
// Rules, in order (per vacant lesson of an absent teacher):
//   1. RELEASE      — vacancy at the day's last period → the class is released.
//   2. STUDY_HALL   — second of two consecutive vacancies for the same class →
//                     Φ/δι with the on-duty deputy.
//   3. SWAP         — another teacher has the SAME class at the last period →
//                     that lesson moves up into the vacancy; the class's last
//                     period is released.
//   4. SUPPORT_MERGE— support classes (ΣΤ…) → students join their regular class.
//   5. COVER        — pick a substitute: free that period, not absent/exempt,
//                     no substitution in the last 7 days (or earlier in this
//                     plan), quota remaining; ranked by tier (≤3 lessons today +
//                     same specialty, ≤3 lessons, ≤4 lessons, rest), tie-broken
//                     by fewest substitutions this year.
//   6. Fallback     — STUDY_HALL when nobody qualifies.
// Plus ROOM_CHANGE requests with an automatic cascade: if the target room is
// occupied that period, its occupant is relocated to a free room from the
// school room list (largest free room first; «κιόσκια» is a study-hall code,
// not a room, so it is never a relocation target).

import { pickFreeRoom, type Room } from "@/lib/rooms";

export type SubRequestType = "ABSENCE" | "EXEMPTION" | "ROOM_CHANGE";

export interface SubRequest {
  id: string;
  staffId: string;
  type: SubRequestType;
  startDate: string; // YYYY-MM-DD
  endDate: string | null; // ABSENCE range end (null = single day)
  periods: number[]; // empty = whole day
  reason: string | null;
  groupId: string | null; // ROOM_CHANGE
  newRoom: string | null; // ROOM_CHANGE
}

export interface SubSlot {
  slotId: string;
  staffId: string | null; // null = unclaimed schedule line
  scheduleName: string; // timetable coding, e.g. "ΗΥ-ΜΑΣΙΑ Μ. ΒΔ"
  period: number;
  groupId: string;
  groupName: string;
  room: string | null;
  courseName: string;
}

export interface SubTeacher {
  staffId: string;
  scheduleName: string;
  maxSubstitutions: number | null; // null = unlimited, 0 = never
  yearCount: number; // substitutions this school year (FINAL plans)
  recentCount: number; // substitutions in the last 7 days
}

export type SubKind =
  | "COVER"
  | "STUDY_HALL"
  | "RELEASE"
  | "SWAP"
  | "ROOM_CHANGE"
  | "SUPPORT_MERGE";

export interface PlanEntryDraft {
  kind: SubKind;
  period: number | null;
  groupId: string | null;
  absentStaffId: string | null;
  substituteStaffId: string | null;
  timetableSlotId: string | null;
  room: string | null;
  newRoom: string | null;
  note: string | null;
  rankInfo: string | null;
  sourceRequestId: string | null;
}

export const STUDY_HALL_LABEL = "Φ/δι εφημ ΒΔ";

// ── Names & eligibility ──────────────────────────────────────────────────────

/** "ΗΥ-ΜΑΣΙΑ Μ. ΒΔ" → "ΗΥ"; names without a dash have no specialty prefix. */
export function specialtyPrefix(scheduleName: string | null | undefined): string {
  const name = (scheduleName ?? "").trim();
  const dash = name.indexOf("-");
  return dash > 0 ? name.slice(0, dash) : "";
}

/**
 * May this teacher be picked as a substitute at all?
 * Deputies (ΒΔ suffix) and the Ξ-/Σ- specialties never substitute; quota 0
 * removes a teacher from the pool explicitly.
 */
export function isPoolEligible(
  scheduleName: string | null | undefined,
  maxSubstitutions: number | null | undefined
): boolean {
  const name = (scheduleName ?? "").trim();
  if (!name) return false;
  if (name.endsWith("ΒΔ")) return false;
  const prefix = specialtyPrefix(name);
  if (prefix === "Ξ" || prefix === "Σ") return false;
  if (maxSubstitutions === 0) return false;
  return true;
}

/** The day's last period from the periods-per-day config (DOW 1–5). */
export function lastPeriodFor(dow: number, periodsPerDay: Record<number, number>): number {
  return periodsPerDay[dow] ?? 7;
}

// ── Request expansion ────────────────────────────────────────────────────────

/** Is the request active on the given date (YYYY-MM-DD)? */
export function requestActiveOn(req: SubRequest, dateIso: string): boolean {
  if (req.type === "ABSENCE") {
    const end = req.endDate ?? req.startDate;
    return req.startDate <= dateIso && dateIso <= end;
  }
  return req.startDate === dateIso; // EXEMPTION / ROOM_CHANGE are single-day
}

/** Staff who must not be picked as substitutes on the date (absent or exempt). */
export function unavailableStaffIds(requests: SubRequest[], dateIso: string): Set<string> {
  const out = new Set<string>();
  for (const r of requests) {
    if ((r.type === "ABSENCE" || r.type === "EXEMPTION") && requestActiveOn(r, dateIso)) {
      out.add(r.staffId);
    }
  }
  return out;
}

export interface Vacancy {
  slot: SubSlot;
  requestId: string;
  reason: string | null;
}

/** The vacant lessons created by the date's absences. */
export function vacanciesFor(
  requests: SubRequest[],
  slots: SubSlot[],
  dateIso: string
): Vacancy[] {
  const out: Vacancy[] = [];
  for (const r of requests) {
    if (r.type !== "ABSENCE" || !requestActiveOn(r, dateIso)) continue;
    for (const slot of slots) {
      if (slot.staffId !== r.staffId) continue;
      if (r.periods.length > 0 && !r.periods.includes(slot.period)) continue;
      out.push({ slot, requestId: r.id, reason: r.reason });
    }
  }
  // deterministic: by absent teacher then period
  return out.sort((a, b) =>
    a.slot.scheduleName === b.slot.scheduleName
      ? a.slot.period - b.slot.period
      : a.slot.scheduleName.localeCompare(b.slot.scheduleName, "el")
  );
}

// ── The planner ──────────────────────────────────────────────────────────────

export interface BuildPlanInput {
  dateIso: string;
  dow: number; // 1–5
  lastPeriod: number;
  slots: SubSlot[]; // every timetable slot of that weekday
  teachers: SubTeacher[]; // all registered staff (pool candidates among them)
  requests: SubRequest[];
  rooms?: Room[]; // relocation candidates for room-change cascades (the school room list)
}

export function buildPlan(input: BuildPlanInput): PlanEntryDraft[] {
  const { dateIso, lastPeriod, slots, teachers, requests } = input;
  const entries: PlanEntryDraft[] = [];

  const unavailable = unavailableStaffIds(requests, dateIso);
  const vacancies = vacanciesFor(requests, slots, dateIso);

  // Lessons each registered teacher actually teaches that day
  const lessonsToday = new Map<string, number>();
  for (const s of slots) {
    if (s.staffId) lessonsToday.set(s.staffId, (lessonsToday.get(s.staffId) ?? 0) + 1);
  }
  // Which (staffId, period) pairs are busy that day
  const busy = new Set<string>();
  for (const s of slots) {
    if (s.staffId) busy.add(`${s.staffId}:${s.period}`);
  }

  const teacherById = new Map(teachers.map((t) => [t.staffId, t]));
  const assignedThisPlan = new Set<string>(); // a teacher covers at most one lesson per day
  const extraYearCount = new Map<string, number>();

  const vacancyKey = (v: Vacancy) => `${v.slot.staffId}:${v.slot.groupId}:${v.slot.period}`;
  const vacancySet = new Set(vacancies.map(vacancyKey));
  const handled = new Set<string>();

  const baseFields = (v: Vacancy) => ({
    period: v.slot.period,
    groupId: v.slot.groupId,
    absentStaffId: v.slot.staffId,
    timetableSlotId: v.slot.slotId,
    room: v.slot.room,
    sourceRequestId: v.requestId,
  });

  for (const v of vacancies) {
    const key = vacancyKey(v);
    if (handled.has(key)) continue;
    handled.add(key);
    const p = v.slot.period;

    // 1. RELEASE — last period of the day
    if (p === lastPeriod) {
      entries.push({
        kind: "RELEASE",
        ...baseFields(v),
        substituteStaffId: null,
        newRoom: null,
        note: "Τελευταία περίοδος — το τμήμα αποχωρεί",
        rankInfo: null,
      });
      continue;
    }

    // 2. STUDY_HALL — second of two consecutive vacancies for the same class
    const hasPrev = vacancySet.has(`${v.slot.staffId}:${v.slot.groupId}:${p - 1}`);
    const hasNext = vacancySet.has(`${v.slot.staffId}:${v.slot.groupId}:${p + 1}`);
    if (hasPrev && !hasNext) {
      entries.push({
        kind: "STUDY_HALL",
        ...baseFields(v),
        substituteStaffId: null,
        newRoom: "κιόσκια",
        note: `${STUDY_HALL_LABEL} (συνεχόμενες περίοδοι)`,
        rankInfo: null,
      });
      continue;
    }

    // 3. SWAP — same class taught by someone else at the last period
    const swapSlot = slots.find(
      (s) =>
        s.period === lastPeriod &&
        s.groupId === v.slot.groupId &&
        s.staffId !== null &&
        s.staffId !== v.slot.staffId &&
        !unavailable.has(s.staffId)
    );
    if (swapSlot) {
      entries.push({
        kind: "SWAP",
        ...baseFields(v),
        substituteStaffId: swapSlot.staffId,
        newRoom: swapSlot.room,
        note: `Αλλαγή από ${lastPeriod}η σε ${p}η (${swapSlot.courseName})`,
        rankInfo: null,
      });
      entries.push({
        kind: "RELEASE",
        period: lastPeriod,
        groupId: v.slot.groupId,
        absentStaffId: swapSlot.staffId,
        substituteStaffId: null,
        timetableSlotId: swapSlot.slotId,
        room: swapSlot.room,
        newRoom: null,
        note: `Το μάθημα μεταφέρθηκε στην ${p}η — το τμήμα αποχωρεί`,
        rankInfo: null,
        sourceRequestId: v.requestId,
      });
      continue;
    }

    // 4. SUPPORT_MERGE — support classes (ΣΤ…)
    if (v.slot.groupName.startsWith("ΣΤ")) {
      entries.push({
        kind: "SUPPORT_MERGE",
        ...baseFields(v),
        substituteStaffId: null,
        newRoom: null,
        note: "Να πάνε στην τάξη που έχει μάθημα το τμήμα",
        rankInfo: null,
      });
      continue;
    }

    // 5. COVER — rank the candidates
    const absentPrefix = specialtyPrefix(v.slot.scheduleName);
    const candidates = teachers
      .filter((t) => {
        if (t.staffId === v.slot.staffId) return false;
        if (!isPoolEligible(t.scheduleName, t.maxSubstitutions)) return false;
        if (unavailable.has(t.staffId)) return false;
        if (busy.has(`${t.staffId}:${p}`)) return false; // must be free that period
        if (!lessonsToday.has(t.staffId)) return false; // not at school that day
        if (t.recentCount > 0) return false; // substituted in the last 7 days
        if (assignedThisPlan.has(t.staffId)) return false; // once per plan
        const year = t.yearCount + (extraYearCount.get(t.staffId) ?? 0);
        if (t.maxSubstitutions != null && year >= t.maxSubstitutions) return false;
        return true;
      })
      .map((t) => {
        const cnt = lessonsToday.get(t.staffId) ?? 0;
        const samePrefix =
          absentPrefix !== "" && specialtyPrefix(t.scheduleName) === absentPrefix;
        const tier = cnt < 4 && samePrefix ? 0 : cnt < 4 ? 1 : cnt < 5 ? 2 : 3;
        return { t, cnt, samePrefix, tier };
      })
      .sort((a, b) => {
        if (a.tier !== b.tier) return a.tier - b.tier;
        const ay = a.t.yearCount + (extraYearCount.get(a.t.staffId) ?? 0);
        const by = b.t.yearCount + (extraYearCount.get(b.t.staffId) ?? 0);
        if (ay !== by) return ay - by;
        return a.t.scheduleName.localeCompare(b.t.scheduleName, "el");
      });

    const pick = candidates[0];
    if (pick) {
      assignedThisPlan.add(pick.t.staffId);
      extraYearCount.set(pick.t.staffId, (extraYearCount.get(pick.t.staffId) ?? 0) + 1);
      const tierLabel = [
        `≤3 μαθήματα σήμερα + ίδια ειδικότητα (${absentPrefix})`,
        "≤3 μαθήματα σήμερα",
        "≤4 μαθήματα σήμερα",
        "διαθέσιμος",
      ][pick.tier];
      entries.push({
        kind: "COVER",
        ...baseFields(v),
        substituteStaffId: pick.t.staffId,
        newRoom: v.slot.room,
        note: null,
        rankInfo: `Επίπεδο ${pick.tier}: ${tierLabel} · ${pick.cnt} μαθήματα σήμερα · ${
          pick.t.yearCount
        } αναπληρώσεις φέτος`,
      });
    } else {
      // 6. Fallback — study hall with the on-duty deputy
      entries.push({
        kind: "STUDY_HALL",
        ...baseFields(v),
        substituteStaffId: null,
        newRoom: "κιόσκια",
        note: `${STUDY_HALL_LABEL} (δεν βρέθηκε διαθέσιμος αναπληρωτής)`,
        rankInfo: null,
      });
    }
  }

  // ── Room changes + automatic cascade ───────────────────────────────────────
  for (const r of requests) {
    if (r.type !== "ROOM_CHANGE" || !requestActiveOn(r, dateIso)) continue;
    const period = r.periods[0] ?? null;
    if (period == null || !r.newRoom) continue;

    entries.push({
      kind: "ROOM_CHANGE",
      period,
      groupId: r.groupId,
      absentStaffId: r.staffId,
      substituteStaffId: r.staffId,
      timetableSlotId: null,
      room: null,
      newRoom: r.newRoom,
      note: r.reason,
      rankInfo: null,
      sourceRequestId: r.id,
    });

    // Cascade: the requested room is occupied that period → relocate the occupant.
    const target = r.newRoom.trim();
    const occupant = slots.find(
      (s) =>
        s.period === period &&
        (s.room ?? "").trim() === target &&
        s.staffId !== r.staffId
    );
    if (occupant) {
      const usedRooms = new Set(
        slots.filter((s) => s.period === period).map((s) => (s.room ?? "").trim())
      );
      usedRooms.add(target);
      const freeRoom = pickFreeRoom(usedRooms, input.rooms ?? []);
      entries.push({
        kind: "ROOM_CHANGE",
        period,
        groupId: occupant.groupId,
        absentStaffId: occupant.staffId,
        substituteStaffId: occupant.staffId,
        timetableSlotId: occupant.slotId,
        room: occupant.room,
        newRoom: freeRoom,
        note: "Αυτόματη αλλαγή αίθουσας",
        rankInfo: null,
        sourceRequestId: r.id,
      });
    }
  }

  return entries;
}
