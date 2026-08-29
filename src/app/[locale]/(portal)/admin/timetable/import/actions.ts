"use server";

import { revalidatePath } from "next/cache";
import { getSuperAdminAuth } from "@/server/authz";
import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";
import { slotLinkAssignments } from "@/lib/timetableLink";
import { parseCourseCell } from "@/lib/timetableParse";
import { splitTeacherBlocks, newStaffProfileNames } from "@/lib/timetableImport";
import * as XLSX from "xlsx";

export interface ScheduleImportResult {
  success: boolean;
  slotsCreated: number;
  slotsUpdated: number;
  slotsLinked: number;
  staffProfilesCreated: number;
  coursesCreated: number;
  groupsCreated: number;
  errors: string[];
}

const EMPTY_RESULT = {
  slotsCreated: 0,
  slotsUpdated: 0,
  slotsLinked: 0,
  staffProfilesCreated: 0,
  coursesCreated: 0,
  groupsCreated: 0,
} as const;

// Column layout: cols 3-42 are the 5×8 timetable grid.
// day  = floor((col - 3) / 8) + 1   → 1..5
// period = ((col - 3) % 8) + 1       → 1..8
const SLOT_START = 3;
const SLOT_END   = 42; // inclusive

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

      const parsed = parseCourseCell(courseCell);
      if (!parsed) continue;

      const { room, courseName } = parsed;
      const { dayOfWeek, period } = slotPosition(col);

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
          select: { id: true, staffId: true },
        });

        if (existing) {
          const updateData: Prisma.TimetableSlotUncheckedUpdateInput = {
            courseId,
            room:     room || null,
            staffName,
            // Never overwrite staffId if a teacher has already claimed this slot.
            ...(existing.staffId ? {} : { staffId: null }),
          };
          await db.timetableSlot.update({ where: { id: existing.id }, data: updateData });
          slotsUpdated++;
        } else {
          const createData: Prisma.TimetableSlotUncheckedCreateInput = {
            groupId, courseId, staffId: null, staffName, dayOfWeek, period, room: room || null,
          };
          await db.timetableSlot.create({ data: createData });
          slotsCreated++;
        }
      } catch (err) {
        errors.push(
          `${staffName} ${["Mon","Tue","Wed","Thu","Fri"][dayOfWeek - 1]} P${period}: ` +
          (err instanceof Error ? err.message : String(err))
        );
      }
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

  return { success: true, slotsCreated, slotsUpdated, slotsLinked, staffProfilesCreated, coursesCreated, groupsCreated, errors };
}
