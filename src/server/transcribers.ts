// «Μεταγραφείς» — server reads. Who needs a transcriber for which test, and
// which listed teachers are free in a test's period(s). Pure rules live in
// @/lib/transcribers.

import { db } from "@/server/db";
import { testStudentsWhere } from "@/server/testStudents";
import { getHomegroupMeetingForDate } from "@/lib/calendar";
import { isLessonCancelled } from "@/lib/homegroupPeriod";
import { dutyDowFor } from "@/lib/dutyRoster";
import { requestActiveOn } from "@/lib/substitutions";
import { getRooms } from "@/server/rooms";
import {
  busyReason,
  coversPeriod,
  roomIsFree,
  testPeriods,
  TRANSCRIBER_ACCOMMODATION,
  type BusyReason,
  type DayCommitments,
} from "@/lib/transcribers";

const NEEDS_TRANSCRIBER = {
  specialEd: { accommodations: { some: { code: TRANSCRIBER_ACCOMMODATION } } },
} as const;

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Accounts of the deputies responsible for special education. */
export async function specialEdDeputyUserIds(): Promise<string[]> {
  const rows = await db.staffProfile.findMany({
    where: { specialEducation: true, userId: { not: null }, user: { isActive: true } },
    select: { userId: true },
  });
  return rows.flatMap((r) => (r.userId ? [r.userId] : []));
}

/** The students of a test's group who are entitled to a transcriber. */
export async function transcriberStudentsForGroup(groupId: string) {
  return db.studentProfile.findMany({
    where: { AND: [testStudentsWhere(groupId), NEEDS_TRANSCRIBER] },
    select: { id: true, user: { select: { name: true } } },
    orderBy: { user: { name: "asc" } },
  });
}

/** The uploaded list of transcribers still on the timetable. */
export async function listTranscribers() {
  return db.staffProfile.findMany({
    where: { transcriber: true, leftTimetableAt: null },
    select: { id: true, scheduleName: true, transcriberPeriods: true, user: { select: { name: true } } },
    orderBy: { scheduleName: "asc" },
  });
}

export interface TranscriberDay {
  /** Each listed transcriber's commitments that day. */
  commitments: Map<string, DayCommitments>;
  /** Who transcribes for whom that day, to leave an assignment out of its own check. */
  transcribing: { staffId: string; testId: string; studentId: string; periods: number[]; room: string | null }[];
  /** Rooms with a lesson (or a moved lesson) in them, per period. */
  roomsInUse: Map<number, Set<string>>;
}

/** What every listed transcriber already has on a date. */
export async function loadTranscriberDay(date: Date, staffIds: readonly string[]): Promise<TranscriberDay> {
  const ids = [...staffIds];
  const dow = dutyDowFor(date);
  const dateIso = iso(date);
  const [daySlots, meeting, requests, covers, assigned, moved] = await Promise.all([
    dow
      ? db.timetableSlot.findMany({ where: { dayOfWeek: dow }, select: { staffId: true, period: true, room: true } })
      : Promise.resolve([]),
    getHomegroupMeetingForDate(date),
    ids.length
      ? db.substitutionRequest.findMany({
          where: {
            staffId: { in: ids },
            type: { in: ["ABSENCE", "EXEMPTION"] },
            OR: [{ startDate: date }, { AND: [{ startDate: { lte: date } }, { endDate: { gte: date } }] }],
          },
          select: { id: true, staffId: true, type: true, startDate: true, endDate: true, periods: true },
        })
      : Promise.resolve([]),
    ids.length
      ? db.substitutionPlanEntry.findMany({
          where: {
            plan: { date, status: "FINAL" },
            kind: { in: ["COVER", "SWAP"] },
            substituteStaffId: { in: ids },
            period: { not: null },
          },
          select: { substituteStaffId: true, period: true },
        })
      : Promise.resolve([]),
    db.testTranscriber.findMany({
      where: { test: { date } },
      select: { staffId: true, testId: true, studentId: true, room: true, test: { select: { period: true, periodCount: true } } },
    }),
    db.substitutionPlanEntry.findMany({
      where: { plan: { date, status: "FINAL" }, period: { not: null }, newRoom: { not: null } },
      select: { period: true, newRoom: true },
    }),
  ]);
  const held = daySlots.filter((s) => !isLessonCancelled(s.period, meeting));
  const slots = held.filter((s) => s.staffId && ids.includes(s.staffId));

  const roomsInUse = new Map<number, Set<string>>();
  const occupy = (period: number, room: string | null) => {
    if (room) roomsInUse.set(period, (roomsInUse.get(period) ?? new Set()).add(room));
  };
  for (const s of held) occupy(s.period, s.room);
  for (const m of moved) occupy(m.period!, m.newRoom);

  const transcribing = assigned.map((a) => ({
    staffId: a.staffId,
    testId: a.testId,
    studentId: a.studentId,
    periods: testPeriods(a.test.period, a.test.periodCount),
    room: a.room,
  }));

  const commitments = new Map<string, DayCommitments>();
  for (const id of ids) {
    const away = requests.filter(
      (r) =>
        r.staffId === id &&
        requestActiveOn(
          {
            id: r.id,
            staffId: r.staffId,
            type: r.type,
            startDate: iso(r.startDate),
            endDate: r.endDate ? iso(r.endDate) : null,
            periods: r.periods,
            reason: null,
            groupId: null,
            newRoom: null,
          },
          dateIso,
        ),
    );
    commitments.set(id, {
      awayAllDay: away.some((r) => r.periods.length === 0),
      awayPeriods: away.flatMap((r) => r.periods),
      lessonPeriods: slots.filter((s) => s.staffId === id).map((s) => s.period),
      coverPeriods: covers.filter((c) => c.substituteStaffId === id).map((c) => c.period!),
      transcribingPeriods: transcribing.filter((t) => t.staffId === id).flatMap((t) => t.periods),
    });
  }
  return { commitments, transcribing, roomsInUse };
}

/**
 * Is the room free for a student's test? Lessons that day and the other
 * transcriptions count; the assignment being checked doesn't.
 */
export function transcriptionRoomFree(
  day: TranscriberDay,
  room: string,
  test: { id: string; period: number; periodCount: number },
  studentId: string,
): boolean {
  const periods = testPeriods(test.period, test.periodCount);
  if (!roomIsFree(room, periods, day.roomsInUse)) return false;
  return !day.transcribing.some(
    (t) =>
      t.room === room &&
      !(t.testId === test.id && t.studentId === studentId) &&
      t.periods.some((p) => periods.includes(p)),
  );
}

/** The students away with a transcriber in a period — not on the class register. */
export async function studentsWithTranscriber(date: Date, period: number): Promise<Set<string>> {
  const rows = await db.testTranscriber.findMany({
    where: { test: { date } },
    select: { studentId: true, test: { select: { period: true, periodCount: true } } },
  });
  return new Set(rows.filter((r) => coversPeriod(r.test, period)).map((r) => r.studentId));
}

/**
 * Why a transcriber can't take a student's test, or null when free. The
 * assignment being checked (same test and student) doesn't count against itself.
 */
export function transcriberBusy(
  day: TranscriberDay,
  staffId: string,
  test: { id: string; period: number; periodCount: number },
  studentId: string,
): BusyReason | null {
  const c = day.commitments.get(staffId);
  if (!c) return null;
  const others = day.transcribing
    .filter((t) => t.staffId === staffId && !(t.testId === test.id && t.studentId === studentId))
    .flatMap((t) => t.periods);
  return busyReason(testPeriods(test.period, test.periodCount), { ...c, transcribingPeriods: others });
}

export interface TranscriberOption {
  staffId: string;
  name: string;
  periods: number | null;
  /** The teacher's own lesson periods that day, to judge the load. */
  lessons: number[];
}

export interface TranscriberNeedRow {
  testId: string;
  studentId: string;
  studentName: string;
  homegroup: string | null;
  date: Date;
  period: number;
  periodCount: number;
  type: "BIG" | "SMALL";
  courseName: string;
  groupName: string;
  teacherName: string;
  assignment: { staffId: string; name: string; busy: BusyReason | null; room: string | null; roomTaken: boolean } | null;
  /** Every room, with whether it is free in the test's period(s). */
  rooms: { name: string; free: boolean }[];
  /** The listed teachers free for this student's test (the current one included). */
  options: TranscriberOption[];
}

function staffLabel(s: { scheduleName: string | null; user: { name: string | null } | null }): string {
  return s.scheduleName ?? s.user?.name ?? "";
}

/** Every student of every test from `from` on who is entitled to a transcriber. */
export async function listTranscriberNeeds(from: Date): Promise<TranscriberNeedRow[]> {
  const students = await db.studentProfile.findMany({
    where: { ...NEEDS_TRANSCRIBER, user: { isActive: true } },
    select: {
      id: true,
      groupId: true,
      user: { select: { name: true } },
      group: { select: { name: true } },
      subjectGroups: { select: { groupId: true } },
    },
  });
  if (students.length === 0) return [];
  const groupsOf = (s: (typeof students)[number]) => [
    ...(s.groupId ? [s.groupId] : []),
    ...s.subjectGroups.map((g) => g.groupId),
  ];

  const [tests, transcribers, rooms] = await Promise.all([
    db.testSchedule.findMany({
      where: { date: { gte: from }, groupId: { in: [...new Set(students.flatMap(groupsOf))] } },
      include: {
        course: { select: { name: true } },
        group: { select: { name: true } },
        staff: { select: { scheduleName: true, user: { select: { name: true } } } },
        transcribers: {
          select: { studentId: true, staffId: true, room: true, staff: { select: { scheduleName: true, user: { select: { name: true } } } } },
        },
      },
      orderBy: [{ date: "asc" }, { period: "asc" }],
    }),
    listTranscribers(),
    getRooms(),
  ]);

  // An assigned teacher may have left the list since; still check their day.
  const staffIds = [...new Set([...transcribers.map((t) => t.id), ...tests.flatMap((t) => t.transcribers.map((a) => a.staffId))])];
  const days = new Map<string, TranscriberDay>();
  for (const key of new Set(tests.map((t) => iso(t.date)))) {
    days.set(key, await loadTranscriberDay(new Date(`${key}T00:00:00.000Z`), staffIds));
  }

  const rows: TranscriberNeedRow[] = [];
  for (const test of tests) {
    const day = days.get(iso(test.date))!;
    for (const s of students) {
      if (!groupsOf(s).includes(test.groupId)) continue;
      const a = test.transcribers.find((x) => x.studentId === s.id) ?? null;
      rows.push({
        testId: test.id,
        studentId: s.id,
        studentName: s.user?.name ?? "",
        homegroup: s.group?.name ?? null,
        date: test.date,
        period: test.period,
        periodCount: test.periodCount,
        type: test.type,
        courseName: test.course.name,
        groupName: test.group.name,
        teacherName: test.staff.user?.name ?? test.staff.scheduleName ?? "",
        assignment: a
          ? {
              staffId: a.staffId,
              name: staffLabel(a.staff),
              busy: transcriberBusy(day, a.staffId, test, s.id),
              room: a.room,
              roomTaken: !!a.room && !transcriptionRoomFree(day, a.room, test, s.id),
            }
          : null,
        rooms: rooms.map((r) => ({ name: r.name, free: transcriptionRoomFree(day, r.name, test, s.id) })),
        options: transcribers
          .filter((t) => t.id !== test.staffId && transcriberBusy(day, t.id, test, s.id) === null)
          .map((t) => ({
            staffId: t.id,
            name: staffLabel(t),
            periods: t.transcriberPeriods,
            lessons: [...(day.commitments.get(t.id)?.lessonPeriods ?? [])].sort((x, y) => x - y),
          })),
      });
    }
  }
  return rows;
}

/** The tests a teacher transcribes from `from` on, soonest first. */
export async function myTranscriptions(staffId: string, from: Date) {
  return db.testTranscriber.findMany({
    where: { staffId, test: { date: { gte: from } } },
    select: {
      id: true,
      room: true,
      studentId: true,
      student: { select: { user: { select: { name: true } }, group: { select: { name: true } } } },
      test: {
        select: {
          groupId: true,
          date: true,
          period: true,
          periodCount: true,
          course: { select: { name: true } },
          group: { select: { name: true } },
          staff: { select: { scheduleName: true, user: { select: { name: true } } } },
        },
      },
    },
    orderBy: [{ test: { date: "asc" } }, { test: { period: "asc" } }],
  });
}
