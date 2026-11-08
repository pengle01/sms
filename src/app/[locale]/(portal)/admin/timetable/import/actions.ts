"use server";

import { revalidatePath } from "next/cache";
import { getSuperAdminAuth } from "@/server/authz";
import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
import { relinkTimetableSlots } from "@/server/staffLink";
import { applyTeacherHandovers } from "@/server/teacherHandover";
import { freezeSlotAttendance } from "@/server/attendanceFreeze";
import {
  HANDOVER_DESIGNATIONS,
  mayDeactivateLogin,
  parseHandover,
  suggestReplacement,
  type HandoverDesignation,
  type HandoverEntry,
} from "@/lib/teacherHandover";
import { parseCourseCell } from "@/lib/timetableParse";
import {
  claimAfterUpdate,
  newStaffProfileNames,
  planRemovals,
  removalGuard,
  rosterChanges,
  splitTeacherBlocks,
  type RemovalSkipReason,
} from "@/lib/timetableImport";
import * as XLSX from "xlsx";

export interface ScheduleImportResult {
  success: boolean;
  slotsCreated: number;
  slotsUpdated: number;
  slotsLinked: number;
  /** Lessons moved off an account whose timetable name didn't match. */
  slotsReleased: number;
  staffProfilesCreated: number;
  coursesCreated: number;
  groupsCreated: number;
  /** Lessons no longer in the file, deleted (no attendance recorded against them). */
  slotsRemoved: number;
  /** Lessons no longer in the file, hidden to keep their attendance history. */
  slotsRetired: number;
  /** Why nothing was removed, when the file did not look complete. */
  removalSkipped: RemovalSkipReason | null;
  /** Teachers no longer in the file's roster — no longer offered at sign-up. */
  staffLeft: number;
  /** Departed teachers whose work was handed over. */
  handovers: number;
  /** Tests that moved to the teacher who now has the lesson. */
  testsHandedOver: number;
  errors: string[];
}

/** One departing teacher on the import's confirmation step. */
export interface HandoverCandidate {
  name: string;
  /** Has a login the handover may switch off. */
  canDeactivate: boolean;
  homegroups: number;
  tests: number;
  dutyPosts: number;
  rooms: number;
  designations: HandoverDesignation[];
  suggestion: string | null;
}

export interface HandoverPreview {
  left: HandoverCandidate[];
  /** Everyone named in the file, sorted: the possible replacements. */
  names: string[];
}

const EMPTY_RESULT = {
  slotsCreated: 0,
  slotsUpdated: 0,
  slotsLinked: 0,
  slotsReleased: 0,
  staffProfilesCreated: 0,
  coursesCreated: 0,
  groupsCreated: 0,
  slotsRemoved: 0,
  slotsRetired: 0,
  removalSkipped: null,
  staffLeft: 0,
  handovers: 0,
  testsHandedOver: 0,
} as const;

// Column layout: cols 3-42 are the 5×8 timetable grid.
// day  = floor((col - 3) / 8) + 1   → 1..5
// period = ((col - 3) % 8) + 1       → 1..8
const SLOT_START = 3;
const SLOT_END   = 42; // inclusive
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function slotPosition(col: number): { dayOfWeek: number; period: number } {
  return {
    dayOfWeek: Math.floor((col - SLOT_START) / 8) + 1,
    period:    ((col - SLOT_START) % 8) + 1,
  };
}

// Infer school year (1-3) from first digit in the group code.
function gradeFromCode(code: string): number {
  const m = code.match(/[123]/);
  return m ? parseInt(m[0]) : 1;
}

// Generate a stable course code from the name.
function toCourseCode(name: string): string {
  return name.trim().toLowerCase().slice(0, 100);
}

function readBlocks(buffer: ArrayBuffer) {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]!]!;
  const rows     = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as string[][];
  return splitTeacherBlocks(rows);
}

/**
 * Before anything is written: who would leave the timetable with this file, what
 * they hold, and who could take over. Empty when the import would skip removals
 * anyway (a file that looks partial must not offer a handover).
 */
export async function previewTeacherHandover(formData: FormData): Promise<HandoverPreview> {
  const empty: HandoverPreview = { left: [], names: [] };
  const auth = await getSuperAdminAuth();
  const file = formData.get("file") as File | null;
  if (!auth || !file || file.size === 0) return empty;

  const { blocks, desyncRows } = readBlocks(await file.arrayBuffer());
  const names = [...new Set(blocks.map((b) => b.staffName))];
  let lessons = 0;
  let unreadable = 0;
  for (const { teacherRow, detailRow } of blocks) {
    for (let col = SLOT_START; col <= SLOT_END; col++) {
      const group = String(teacherRow[col] ?? "").trim();
      const course = String(detailRow[col] ?? "").trim();
      if (!group || !course) continue;
      if (parseCourseCell(course)) lessons++;
      else unreadable++;
    }
  }
  const guard = removalGuard({
    cellErrors: unreadable + desyncRows.length,
    importedLessons: lessons,
    activeLessons: await db.timetableSlot.count(),
  });
  if (guard) return empty;

  const profiles = await db.staffProfile.findMany({
    where: { scheduleName: { not: null } },
    select: {
      scheduleName: true,
      leftTimetableAt: true,
      userId: true,
      user: { select: { isActive: true, role: true, extraRoles: true } },
      specialEducation: true,
      substitutionCoordinator: true,
      ddkCoordinator: true,
      disciplinaryCouncil: true,
      itMaintenance: true,
      itManager: true,
      parentMessaging: true,
      _count: {
        select: {
          homeroomGroups: true,
          homeroomHeadGroups: true,
          homeroomCounselorGroups: true,
          testSchedules: true,
          breakDutyPosts: true,
          roomsMaintained: true,
        },
      },
    },
  });
  const { left } = rosterChanges(
    profiles.map((p) => ({ scheduleName: p.scheduleName, leftTimetable: p.leftTimetableAt !== null })),
    names,
  );
  const newNames = newStaffProfileNames(names, profiles.map((p) => p.scheduleName));
  const byName = new Map(profiles.map((p) => [p.scheduleName!.trim(), p]));
  return {
    names: [...names].sort((a, b) => a.localeCompare(b, "el")),
    left: left.map((name) => {
      const p = byName.get(name)!;
      return {
        name,
        canDeactivate:
          !!p.userId &&
          !!p.user?.isActive &&
          mayDeactivateLogin({
            targetUserId: p.userId,
            actorUserId: auth.userId,
            targetRole: p.user.role,
            targetExtraRoles: p.user.extraRoles,
          }),
        homegroups: p._count.homeroomGroups + p._count.homeroomHeadGroups + p._count.homeroomCounselorGroups,
        tests: p._count.testSchedules,
        dutyPosts: p._count.breakDutyPosts,
        rooms: p._count.roomsMaintained,
        designations: HANDOVER_DESIGNATIONS.filter((d) => p[d]),
        suggestion: suggestReplacement(name, newNames),
      };
    }),
  };
}

export async function importSchedule(
  _prev: ScheduleImportResult | null,
  formData: FormData,
): Promise<ScheduleImportResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) {
    return { success: false, ...EMPTY_RESULT, errors: ["Unauthorized"] };
  }

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { success: false, ...EMPTY_RESULT, errors: ["No file provided"] };
  }

  const buffer = await file.arrayBuffer();

  let slotsCreated = 0, slotsUpdated = 0, coursesCreated = 0, groupsCreated = 0;
  const errors: string[] = [];
  // Staff names seen in this file — the post-import re-link only needs to look
  // at these teachers' slots, not the whole table.
  const importedStaffNames = new Set<string>();
  // Every lesson the file contains. The file is the whole timetable: current
  // lessons not in this set are removed after the loop.
  const seenSlotIds = new Set<string>();
  let cellErrors = 0;
  const unreadableCells: string[] = [];

  // Cache to avoid redundant DB round-trips within the same import.
  const courseCache = new Map<string, string>(); // code → id
  const groupCache  = new Map<string, string>(); // name → id

  async function getOrCreateCourse(name: string): Promise<string> {
    const code = toCourseCode(name);
    if (courseCache.has(code)) return courseCache.get(code)!;

    const existing = await db.course.findUnique({ where: { code }, select: { id: true } });
    if (existing) { courseCache.set(code, existing.id); return existing.id; }

    const created = await db.course.create({
      data: { name, nameEl: name, code },
      select: { id: true },
    });
    coursesCreated++;
    courseCache.set(code, created.id);
    return created.id;
  }

  async function getOrCreateGroup(name: string): Promise<string> {
    if (groupCache.has(name)) return groupCache.get(name)!;

    const existing = await db.group.findUnique({ where: { name }, select: { id: true } });
    if (existing) { groupCache.set(name, existing.id); return existing.id; }

    const grade   = gradeFromCode(name);
    const created = await db.group.create({ data: { name, grade }, select: { id: true } });
    groupsCreated++;
    groupCache.set(name, created.id);
    return created.id;
  }

  // Teacher row (name in col 0) + detail row, in pairs. splitTeacherBlocks owns
  // the stride and reports rows where the two-row pairing has slipped.
  const { blocks, desyncRows } = readBlocks(buffer);
  for (const rowIndex of desyncRows) {
    errors.push(
      `Row ${rowIndex + 1}: expected a room/course row but found a teacher name — ` +
      `the file's two-row blocks are out of step from here on, so lessons below ` +
      `may be attributed to the wrong teacher.`,
    );
  }

  for (const { teacherRow, detailRow, staffName } of blocks) {
    importedStaffNames.add(staffName);

    for (let col = SLOT_START; col <= SLOT_END; col++) {
      const groupCell  = String(teacherRow[col] ?? "").trim();
      const courseCell = String(detailRow[col]  ?? "").trim();
      if (!groupCell || !courseCell) continue;

      const { dayOfWeek, period } = slotPosition(col);
      const parsed = parseCourseCell(courseCell);
      if (!parsed) {
        // A class with no readable "room / lesson" under it: this lesson can't be
        // imported, so it must not count as removed either.
        unreadableCells.push(`${staffName} ${DAYS[dayOfWeek - 1]} P${period}`);
        continue;
      }

      const { room, courseName } = parsed;

      // Group codes: full code from the cell is the Group name.
      // A cell can hold a single code; combined codes like "ΜΟ2α+ΜΟ2β" are treated
      // as ONE group (the combined class). This matches how the student-enrollment
      // file will reference them.
      const groupName = groupCell;

      try {
        const [courseId, groupId] = await Promise.all([
          getOrCreateCourse(courseName),
          getOrCreateGroup(groupName),
        ]);

        const existing = await db.timetableSlot.findUnique({
          where: { groupId_dayOfWeek_period: { groupId, dayOfWeek, period } },
          select: {
            id: true,
            staffId: true,
            staffName: true,
            courseId: true,
            staff: { select: { scheduleName: true } },
          },
        });

        if (existing) {
          // Past registers keep what this lesson was when they were taken.
          if (existing.courseId !== courseId || existing.staffName !== staffName) {
            await freezeSlotAttendance(existing);
          }
          const updateData: Prisma.TimetableSlotUncheckedUpdateInput = {
            courseId,
            room:     room || null,
            staffName,
            // A teacher's claim survives only while the file still names them;
            // a reassigned lesson is released for the re-link below.
            staffId:   claimAfterUpdate(existing, staffName),
            // Back in the file → back in the timetable.
            removedAt: null,
          };
          await db.timetableSlot.update({ where: { id: existing.id }, data: updateData });
          seenSlotIds.add(existing.id);
          slotsUpdated++;
        } else {
          const createData: Prisma.TimetableSlotUncheckedCreateInput = {
            groupId, courseId, staffId: null, staffName, dayOfWeek, period, room: room || null,
          };
          const created = await db.timetableSlot.create({ data: createData, select: { id: true } });
          seenSlotIds.add(created.id);
          slotsCreated++;
        }
      } catch (err) {
        cellErrors++;
        errors.push(
          `${staffName} ${DAYS[dayOfWeek - 1]} P${period}: ` +
          (err instanceof Error ? err.message : String(err))
        );
      }
    }
  }

  if (unreadableCells.length > 0) {
    const shown = unreadableCells.slice(0, 5).join(", ");
    const more = unreadableCells.length > 5 ? ` and ${unreadableCells.length - 5} more` : "";
    errors.push(
      `${unreadableCells.length} cell(s) have a class but no readable "room / lesson" ` +
      `under it (${shown}${more}) — is this the timetable export?`,
    );
  }

  // Lessons no longer in the file leave the timetable — a dropped lesson, the old
  // period of a moved one, every lesson of a teacher who left. Lessons with
  // attendance are hidden rather than deleted: attendance reaches its period and
  // course through the lesson, and deleting it would strip that history.
  let slotsRemoved = 0, slotsRetired = 0;
  const active = await db.timetableSlot.findMany({
    select: { id: true, _count: { select: { attendance: true } } },
  });
  const removalSkipped = removalGuard({
    cellErrors: cellErrors + unreadableCells.length + desyncRows.length,
    importedLessons: seenSlotIds.size,
    activeLessons: active.length,
  });
  if (removalSkipped) {
    errors.push(
      removalSkipped === "fileTooSmall"
        ? `Nothing was removed from the timetable: the file holds ${seenSlotIds.size} lessons against ` +
          `${active.length} in the current timetable, so it doesn't look like the whole timetable.`
        : `Nothing was removed from the timetable because of the errors above. Fix them and import again ` +
          `to remove lessons that are no longer in the file.`,
    );
  } else {
    const { deleteIds, hideIds } = planRemovals(
      active.map((s) => ({ id: s.id, hasAttendance: s._count.attendance > 0 })),
      seenSlotIds,
    );
    if (deleteIds.length + hideIds.length > 0) {
      const [deleted, hidden] = await db.$transaction([
        db.timetableSlot.deleteMany({ where: { id: { in: deleteIds } } }),
        db.timetableSlot.updateMany({ where: { id: { in: hideIds } }, data: { removedAt: new Date() } }),
      ]);
      slotsRemoved = deleted.count;
      slotsRetired = hidden.count;
    }
  }

  // The Καθηγητής column is the school's staff roster, not just a label on a
  // lesson. Someone with no teaching hours — a counselor — produces no slot, and
  // a roster derived from slots loses them: they cannot claim their name at
  // sign-up and cannot be named in the homegroup assignment sheet. Give every
  // imported name a profile, whether or not it carried lessons.
  //
  // No `staffId` is stamped on their slots here: that stays the job of approval
  // and of the re-link below, both of which deliberately require a live login.
  const knownStaff = await db.staffProfile.findMany({
    where: { scheduleName: { not: null } },
    select: { scheduleName: true, leftTimetableAt: true },
  });
  const rosterAdditions = newStaffProfileNames(
    importedStaffNames,
    knownStaff.map((p) => p.scheduleName),
  );
  let staffProfilesCreated = 0;
  if (rosterAdditions.length > 0) {
    const created = await db.staffProfile.createMany({
      data: rosterAdditions.map((scheduleName) => ({ scheduleName })),
    });
    staffProfilesCreated = created.count;
  }

  // Teachers who dropped out of the roster: no longer offered at sign-up or in
  // the teacher search. Marked, not deleted — a profile can carry homerooms,
  // substitution history and a login. Same guard as lesson removal: a file that
  // looks partial must not hide half the staff.
  let staffLeft = 0;
  let handoverEntries: HandoverEntry[] = [];
  if (!removalSkipped) {
    const { left, back } = rosterChanges(
      knownStaff.map((p) => ({ scheduleName: p.scheduleName, leftTimetable: p.leftTimetableAt !== null })),
      importedStaffNames,
    );
    if (left.length + back.length > 0) {
      const [marked] = await db.$transaction([
        db.staffProfile.updateMany({ where: { scheduleName: { in: left } }, data: { leftTimetableAt: new Date() } }),
        db.staffProfile.updateMany({ where: { scheduleName: { in: back } }, data: { leftTimetableAt: null } }),
      ]);
      staffLeft = marked.count;
    }
    handoverEntries = parseHandover(formData.get("handover") as string | null, left, importedStaffNames);
  }

  // Attach every lesson to the account whose timetable name matches it: new
  // lessons of already-approved teachers get linked, and lessons left attached
  // to an account with another name (e.g. after its name was corrected) are
  // moved to the right one. See slotRelinks.
  const { linked: slotsLinked, released: slotsReleased } = await relinkTimetableSlots();

  const handover = await applyTeacherHandovers(handoverEntries, auth.userId);
  errors.push(...handover.errors);

  // Slots feed the admin timetable, teacher schedules/mark sheets and group
  // pages across portals. Imports are rare admin operations, so refresh
  // everything rather than risk a stale page — same policy as the enrollment
  // import.
  revalidatePath("/", "layout");

  return {
    success: true, slotsCreated, slotsUpdated, slotsLinked, slotsReleased, staffProfilesCreated, coursesCreated, groupsCreated,
    slotsRemoved, slotsRetired, removalSkipped, staffLeft,
    handovers: handover.applied, testsHandedOver: handover.testsMoved, errors,
  };
}
