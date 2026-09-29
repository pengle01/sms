// Where teachers are and which rooms are free, over the regular weekly
// timetable. Pure (no DB) so the rules are unit-tested; the page is
// src/components/whereabouts/Whereabouts.tsx.

import { matchesSearch, normalizeSearch } from "@/lib/textSearch";
import type { PeriodsPerDay } from "@/lib/periods";

export const WEEK_DAYS = [1, 2, 3, 4, 5] as const;

/** «κιόσκια» is the study-hall code for staying in the yard — never a room. */
const NOT_A_ROOM = "κιόσκια";

export interface WeekSlot {
  dayOfWeek: number;
  period: number;
  room: string | null;
  /** The timetable's teacher name (the Καθηγητής column). */
  staffName: string | null;
  groupName: string;
  courseName: string;
}

/** day → period → items. Missing keys mean nothing is there. */
export type WeekGrid<T> = Map<number, Map<number, T[]>>;

function put<T>(grid: WeekGrid<T>, day: number, period: number, item: T) {
  let byPeriod = grid.get(day);
  if (!byPeriod) grid.set(day, (byPeriod = new Map()));
  const list = byPeriod.get(period);
  if (list) list.push(item);
  else byPeriod.set(period, [item]);
}

export function cell<T>(grid: WeekGrid<T>, day: number, period: number): T[] {
  return grid.get(day)?.get(period) ?? [];
}

const roomKey = (room: string | null | undefined) => (room ?? "").trim();

/**
 * A teacher's week. Matched by the timetable NAME, never by staffId: staffId is
 * only stamped when a teacher claims their account, so most of the roster would
 * show an empty week (same reason as lessonsByName in staffFilter.ts). A cell
 * can hold more than one lesson (combined groups).
 */
export function teacherWeek(slots: WeekSlot[], scheduleName: string): WeekGrid<WeekSlot> {
  const name = scheduleName.trim();
  const grid: WeekGrid<WeekSlot> = new Map();
  for (const s of slots) if (s.staffName?.trim() === name) put(grid, s.dayOfWeek, s.period, s);
  return grid;
}

/** One room's week: the lessons held in it. */
export function roomWeek(slots: WeekSlot[], roomName: string): WeekGrid<WeekSlot> {
  const name = roomName.trim();
  const grid: WeekGrid<WeekSlot> = new Map();
  for (const s of slots) if (roomKey(s.room) === name) put(grid, s.dayOfWeek, s.period, s);
  return grid;
}

/**
 * The rooms free in every period of the week: rooms of the school's room list
 * with no lesson in that slot. Rooms are matched to lessons by trimmed name.
 * Periods beyond a day's count are left empty — there is no school then.
 * `rooms` should already be in display order; that order is kept.
 */
export function freeRoomsWeek(
  roomNames: string[],
  slots: WeekSlot[],
  periodsPerDay: PeriodsPerDay,
): WeekGrid<string> {
  const used = new Set(slots.map((s) => `${s.dayOfWeek}:${s.period}:${roomKey(s.room)}`));
  const grid: WeekGrid<string> = new Map();
  for (const day of WEEK_DAYS) {
    const count = periodsPerDay[day] ?? 7;
    for (let period = 1; period <= count; period++) {
      for (const name of roomNames) {
        if (name === NOT_A_ROOM) continue;
        if (!used.has(`${day}:${period}:${name.trim()}`)) put(grid, day, period, name);
      }
    }
  }
  return grid;
}

/** Rooms written in the timetable that are missing from the room list — the admin can add them in Settings. */
export function unknownTimetableRooms(roomNames: string[], slots: WeekSlot[]): string[] {
  const known = new Set(roomNames.map((n) => n.trim()));
  const out = new Set<string>();
  for (const s of slots) {
    const r = roomKey(s.room);
    if (r && r !== NOT_A_ROOM && !known.has(r)) out.add(r);
  }
  return [...out].sort((a, b) => a.localeCompare(b, "el", { numeric: true }));
}

export interface TeacherEntry {
  /** The timetable name — what lessons are matched by. */
  scheduleName: string;
  /** The account's name, when the teacher has signed up. */
  accountName: string | null;
  phone: string | null;
}

/**
 * Resolve the search box to teachers. An exact name (accent/case-insensitive,
 * schedule or account name) picks that one teacher even if it is also part of a
 * longer name; otherwise every teacher whose name contains the text.
 */
export function findTeachers(roster: TeacherEntry[], query: string): TeacherEntry[] {
  const q = normalizeSearch(query);
  if (!q) return [];
  const exact = roster.filter(
    (t) => normalizeSearch(t.scheduleName) === q || (!!t.accountName && normalizeSearch(t.accountName) === q),
  );
  if (exact.length > 0) return exact;
  return roster.filter((t) => matchesSearch(t.scheduleName, query) || matchesSearch(t.accountName, query));
}
