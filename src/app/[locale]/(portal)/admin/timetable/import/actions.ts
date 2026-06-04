"use server";

import { getSuperAdminAuth } from "@/server/authz";
import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma";
import * as XLSX from "xlsx";

export interface ScheduleImportResult {
  success: boolean;
  slotsCreated: number;
  slotsUpdated: number;
  coursesCreated: number;
  groupsCreated: number;
  errors: string[];
}

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

// Parse "room / Course name (grade)" → { room, courseName }
function parseCourseCell(cell: string): { room: string; courseName: string } | null {
  const m = cell.match(/^(.+?)\s*\/\s*(.+?)\s*\(.*\)\s*$/);
  if (!m) return null;
  return { room: m[1]!.trim(), courseName: m[2]!.trim() };
}

export async function importSchedule(
  _prev: ScheduleImportResult | null,
  formData: FormData,
): Promise<ScheduleImportResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) {
    return { success: false, slotsCreated: 0, slotsUpdated: 0, coursesCreated: 0, groupsCreated: 0, errors: ["Unauthorized"] };
  }

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { success: false, slotsCreated: 0, slotsUpdated: 0, coursesCreated: 0, groupsCreated: 0, errors: ["No file provided"] };
  }

  const buffer   = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]!]!;
  const rows     = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as string[][];

  let slotsCreated = 0, slotsUpdated = 0, coursesCreated = 0, groupsCreated = 0;
  const errors: string[] = [];

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

  // Process rows in pairs: teacher row (name in col 0) + detail row (empty col 0).
  let i = 2; // skip two header rows
  while (i < rows.length) {
    const teacherRow = rows[i]!;
    const detailRow  = rows[i + 1] ?? [];
    i += 2;

    const staffName = String(teacherRow[0] ?? "").trim();
    if (!staffName) continue; // blank / summary row

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

  return { success: true, slotsCreated, slotsUpdated, coursesCreated, groupsCreated, errors };
}
