"use server";

import { revalidatePath } from "next/cache";
import { getSuperAdminAuth } from "@/server/authz";
import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
import { slotLinkAssignments } from "@/lib/timetableLink";
import { parseCourseCell } from "@/lib/timetableParse";
import {
  claimAfterUpdate,
  newStaffProfileNames,
  planRemovals,
  removalGuard,
  splitTeacherBlocks,
  type RemovalSkipReason,
} from "@/lib/timetableImport";
import * as XLSX from "xlsx";

export interface ScheduleImportResult {
  success: boolean;
  slotsCreated: number;
  slotsUpdated: number;
  slotsLinked: number;
  staffProfilesCreated: number;
  coursesCreated: number;
  groupsCreated: number;
  /** Lessons no longer in the file, deleted (no attendance recorded against them). */
  slotsRemoved: number;
  /** Lessons no longer in the file, hidden to keep their attendance history. */
  slotsRetired: number;
  /** Why nothing was removed, when the file did not look complete. */
  removalSkipped: RemovalSkipReason | null;
  errors: string[];
}

const EMPTY_RESULT = {
  slotsCreated: 0,
  slotsUpdated: 0,
  slotsLinked: 0,
  staffProfilesCreated: 0,
  coursesCreated: 0,
  groupsCreated: 0,
  slotsRemoved: 0,
  slotsRetired: 0,
  removalSkipped: null,
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

  const buffer   = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]!]!;
  const rows     = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as string[][];

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
  const { blocks, desyncRows } = splitTeacherBlocks(rows);
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
          select: { id: true, staffId: true, staffName: true },
        });

        if (existing) {
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
    select: { scheduleName: true },
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

  // Re-link freshly imported slots to teachers who were already approved.
  // Registration-approval links slots by staffName, but a lesson ADDED to an
  // existing teacher arrives with staffId=null and would otherwise stay invisible
  // in that teacher's portal (which filters by staffId). Mirror the approval link
  // here so new lessons propagate. Claimed slots are left untouched.
  let slotsLinked = 0;
  const [unclaimed, profiles] = await Promise.all([
    db.timetableSlot.findMany({
      // Only this import's teachers — slots for other names can't have changed.
      where: { staffId: null, staffName: { in: [...importedStaffNames] } },
      select: { id: true, staffName: true, staffId: true },
    }),
    db.staffProfile.findMany({
      // ALL live profiles, not just this import's names: ambiguity detection in
      // slotLinkAssignments must see every profile sharing a scheduleName. Only
      // profiles with a live login may claim slots — a detached (deleted-user)
      // or seeded profile re-grabbing them would block re-registration.
      where: { scheduleName: { not: null }, userId: { not: null } },
      select: { id: true, scheduleName: true, userId: true },
    }),
  ]);
  const links = slotLinkAssignments(unclaimed, profiles);
  const byProfile = new Map<string, string[]>();
  for (const { slotId, profileId } of links) {
    const list = byProfile.get(profileId) ?? [];
    list.push(slotId);
    byProfile.set(profileId, list);
  }
  if (byProfile.size > 0) {
    // One pipelined batch instead of a round-trip per profile.
    const linked = await db.$transaction(
      [...byProfile].map(([profileId, slotIds]) =>
        db.timetableSlot.updateMany({ where: { id: { in: slotIds } }, data: { staffId: profileId } }),
      ),
    );
    slotsLinked = linked.reduce((n, r) => n + r.count, 0);
  }

  // Slots feed the admin timetable, teacher schedules/mark sheets and group
  // pages across portals. Imports are rare admin operations, so refresh
  // everything rather than risk a stale page — same policy as the enrollment
  // import.
  revalidatePath("/", "layout");

  return {
    success: true, slotsCreated, slotsUpdated, slotsLinked, staffProfilesCreated, coursesCreated, groupsCreated,
    slotsRemoved, slotsRetired, removalSkipped, errors,
  };
}
