import { db } from "@/server/db";
import { getNow, localDateStr, utcMidnight } from "@/lib/dates";
import { getSchoolYear } from "@/lib/schoolConfig";
import { termOf } from "@/lib/schoolYear";
import { getSpecialDaysInRange, isHolidayType, type SpecialDayType } from "@/lib/calendar";
import {
  addDaysIso,
  attendanceLockStartIso,
  schoolWeekdaysBetween,
  type AttendanceLockWindow,
} from "@/lib/attendanceLock";

export interface PendingLesson {
  dateIso: string;
  period: number;
  groupId: string;
  groupName: string;
  courseName: string;
  /** Homeroom special-day attendance; absent = a regular timetable lesson. */
  kind?: "intercalary" | "excursion";
}

const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const dowOf = (iso: string) => new Date(iso + "T00:00:00.000Z").getUTCDay();

/**
 * Lessons a teacher was responsible for but never marked, within the lock
 * window. Counts only fully-elapsed school days (today is excluded — there are
 * no bell times to judge mid-day). Covers regular timetable lessons AND the
 * homeroom attendance owed on intercalary days (the inserted meeting period)
 * and excursion days (period 1). A lesson is NOT pending when:
 *   • attendance already exists for it (anyone — incl. a cover), or
 *   • a finalized substitution plan covers/releases a regular lesson because the
 *     teacher was absent that day, or
 *   • the date is a holiday or a school event (no enforced attendance).
 */
export async function getPendingAttendance(
  staffId: string,
  window: AttendanceLockWindow,
): Promise<PendingLesson[]> {
  const now = getNow();
  const todayIso = localDateStr(now);

  const ranges = await getSchoolYear();
  const yearStartIso = isoOf(ranges.yearStart);
  const term = termOf(now, ranges);
  const termStartIso = isoOf(term === "TERM2" ? ranges.term2Start : ranges.yearStart);

  let startIso = attendanceLockStartIso(window, todayIso, yearStartIso, termStartIso);
  if (startIso < yearStartIso) startIso = yearStartIso; // never before the year

  const [slots, staff] = await Promise.all([
    db.timetableSlot.findMany({
      where: { staffId },
      select: {
        id: true,
        dayOfWeek: true,
        period: true,
        groupId: true,
        group: { select: { name: true } },
        course: { select: { name: true } },
      },
    }),
    db.staffProfile.findUnique({
      where: { id: staffId },
      select: {
        homeroomGroups: { select: { id: true, name: true } },
        homeroomHeadGroups: { select: { id: true, name: true } },
      },
    }),
  ]);

  // Homeroom groups the teacher marks on intercalary/excursion days (deduped).
  const homeroomGroups = [
    ...(staff?.homeroomGroups ?? []),
    ...(staff?.homeroomHeadGroups ?? []),
  ].filter((g, i, arr) => arr.findIndex((x) => x.id === g.id) === i);

  if (slots.length === 0 && homeroomGroups.length === 0) return [];

  const allWeekdays = schoolWeekdaysBetween(startIso, todayIso);
  if (allWeekdays.length === 0) return [];

  // Classify each day in the window by special-day type.
  const specials = await getSpecialDaysInRange(
    utcMidnight(startIso),
    utcMidnight(addDaysIso(todayIso, -1)),
  );
  const typeByDate = new Map<string, SpecialDayType>();
  const meetingByDate = new Map<string, number>();
  for (const sd of specials) {
    let cur = isoOf(sd.startDate);
    const end = isoOf(sd.endDate);
    let guard = 0;
    while (cur <= end && guard++ < 400) {
      typeByDate.set(cur, sd.type);
      if (sd.type === "INTERCALARY") meetingByDate.set(cur, sd.intercalaryMeetingPeriod ?? 8);
      cur = addDaysIso(cur, 1);
    }
  }

  // School days = not a holiday and not a school event (those have no enforced
  // attendance). Normal / intercalary / excursion days remain.
  const isSchoolDay = (iso: string) => {
    const t = typeByDate.get(iso);
    return !(t && (isHolidayType(t) || t === "SCHOOL_EVENT"));
  };
  let dates = allWeekdays.filter(isSchoolDay);
  if (window === "day") dates = dates.slice(-1); // only the most recent school day
  if (dates.length === 0) return [];

  const rangeStart = utcMidnight(dates[0]!);
  const rangeEnd = utcMidnight(dates[dates.length - 1]!);
  const homeroomGroupIds = homeroomGroups.map((g) => g.id);

  const [marked, intercalaryMarked, absentEntries] = await Promise.all([
    slots.length > 0
      ? db.attendance.findMany({
          where: { timetableSlotId: { in: slots.map((s) => s.id) }, date: { gte: rangeStart, lte: rangeEnd } },
          select: { timetableSlotId: true, date: true },
        })
      : Promise.resolve([]),
    homeroomGroupIds.length > 0
      ? db.attendance.findMany({
          where: { intercalaryGroupId: { in: homeroomGroupIds }, date: { gte: rangeStart, lte: rangeEnd } },
          select: { intercalaryGroupId: true, intercalaryPeriod: true, date: true },
        })
      : Promise.resolve([]),
    db.substitutionPlanEntry.findMany({
      where: { absentStaffId: staffId, plan: { status: "FINAL", date: { gte: rangeStart, lte: rangeEnd } } },
      select: { period: true, plan: { select: { date: true } } },
    }),
  ]);

  const markedSet = new Set<string>(); // slotId::dateIso
  for (const a of marked) if (a.timetableSlotId) markedSet.add(`${a.timetableSlotId}::${isoOf(a.date)}`);
  const homeroomMarkedSet = new Set<string>(); // groupId::period::dateIso
  for (const a of intercalaryMarked)
    if (a.intercalaryGroupId && a.intercalaryPeriod != null)
      homeroomMarkedSet.add(`${a.intercalaryGroupId}::${a.intercalaryPeriod}::${isoOf(a.date)}`);
  const absentSet = new Set<string>(); // dateIso:period
  for (const e of absentEntries) if (e.period != null) absentSet.add(`${isoOf(e.plan.date)}:${e.period}`);

  const slotsByDow = new Map<number, typeof slots>();
  for (const s of slots) {
    const list = slotsByDow.get(s.dayOfWeek);
    if (list) list.push(s);
    else slotsByDow.set(s.dayOfWeek, [s]);
  }

  const pending: PendingLesson[] = [];
  for (const dateIso of dates) {
    const type = typeByDate.get(dateIso);
    const isExcursion = type === "EXCURSION";
    const isIntercalary = type === "INTERCALARY";

    // Homeroom attendance owed on intercalary (meeting period) / excursion (P1).
    if (isExcursion || isIntercalary) {
      const period = isIntercalary ? meetingByDate.get(dateIso) ?? 8 : 1;
      for (const hg of homeroomGroups) {
        if (homeroomMarkedSet.has(`${hg.id}::${period}::${dateIso}`)) continue;
        pending.push({
          dateIso,
          period,
          groupId: hg.id,
          groupName: hg.name,
          courseName: "",
          kind: isIntercalary ? "intercalary" : "excursion",
        });
      }
    }

    // Regular lessons still happen on intercalary days (shifted), but NOT on
    // excursion days (the class is out).
    if (!isExcursion) {
      for (const s of slotsByDow.get(dowOf(dateIso)) ?? []) {
        if (!s.groupId) continue;
        if (markedSet.has(`${s.id}::${dateIso}`)) continue;
        if (absentSet.has(`${dateIso}:${s.period}`)) continue;
        pending.push({
          dateIso,
          period: s.period,
          groupId: s.groupId,
          groupName: s.group?.name ?? "—",
          courseName: s.course?.name ?? "—",
        });
      }
    }
  }
  pending.sort((a, b) => a.dateIso.localeCompare(b.dateIso) || a.period - b.period);
  return pending;
}
