import { db } from "@/server/db";
import { getNow, localDateStr, utcMidnight } from "@/lib/dates";
import { getSchoolYear } from "@/lib/schoolConfig";
import { termOf } from "@/lib/schoolYear";
import { getSpecialDaysInRange } from "@/lib/calendar";
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
}

const isoOf = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Lessons a teacher was responsible for but never marked, within the lock
 * window. Counts only fully-elapsed school days (today is excluded — there are
 * no bell times to judge mid-day). A lesson is NOT pending when:
 *   • attendance already exists for that slot+date (anyone — incl. a cover), or
 *   • a finalized substitution plan covers/releases it because the teacher was
 *     absent that day, or
 *   • the date is a holiday / intercalary / excursion / event (special day).
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

  const slots = await db.timetableSlot.findMany({
    where: { staffId },
    select: {
      id: true,
      dayOfWeek: true,
      period: true,
      groupId: true,
      group: { select: { name: true } },
      course: { select: { name: true } },
    },
  });
  if (slots.length === 0) return [];

  let dates = schoolWeekdaysBetween(startIso, todayIso);
  if (dates.length === 0) return [];

  // Drop special days (holidays + intercalary/excursion/event): conservatively
  // we don't enforce attendance on any non-plain day.
  const specials = await getSpecialDaysInRange(utcMidnight(startIso), utcMidnight(addDaysIso(todayIso, -1)));
  const excluded = new Set<string>();
  for (const sd of specials) {
    let cur = isoOf(sd.startDate);
    const end = isoOf(sd.endDate);
    let guard = 0;
    while (cur <= end && guard++ < 400) {
      excluded.add(cur);
      cur = addDaysIso(cur, 1);
    }
  }
  dates = dates.filter((d) => !excluded.has(d));
  if (window === "day") dates = dates.slice(-1); // only the most recent school day
  if (dates.length === 0) return [];

  const rangeStart = utcMidnight(dates[0]!);
  const rangeEnd = utcMidnight(dates[dates.length - 1]!);

  const [marked, absentEntries] = await Promise.all([
    db.attendance.findMany({
      where: { timetableSlotId: { in: slots.map((s) => s.id) }, date: { gte: rangeStart, lte: rangeEnd } },
      select: { timetableSlotId: true, date: true },
    }),
    db.substitutionPlanEntry.findMany({
      where: { absentStaffId: staffId, plan: { status: "FINAL", date: { gte: rangeStart, lte: rangeEnd } } },
      select: { period: true, plan: { select: { date: true } } },
    }),
  ]);

  const markedSet = new Set<string>(); // slotId::dateIso
  for (const a of marked) if (a.timetableSlotId) markedSet.add(`${a.timetableSlotId}::${isoOf(a.date)}`);
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
    const dow = new Date(dateIso + "T00:00:00.000Z").getUTCDay();
    for (const s of slotsByDow.get(dow) ?? []) {
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
  pending.sort((a, b) => a.dateIso.localeCompare(b.dateIso) || a.period - b.period);
  return pending;
}
