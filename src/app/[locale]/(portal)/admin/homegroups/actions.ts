"use server";

import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { writeAudit, requestMeta } from "@/server/audit";
import { groupRemoval, type GroupRemoval } from "@/lib/homegroupFilter";

async function requireSuperAdmin() {
  const auth = await getSuperAdminAuth();
  if (!auth) throw new Error("Forbidden");
}

export async function assignHomeroomTeacher(groupId: string, staffId: string | null) {
  await requireSuperAdmin();
  await db.group.update({ where: { id: groupId }, data: { homeroomTeacherId: staffId } });
  revalidatePath("/[locale]/admin/homegroups", "page");
}

export async function assignHomeroomHeadteacher(groupId: string, staffId: string | null) {
  await requireSuperAdmin();
  await db.group.update({ where: { id: groupId }, data: { homeroomHeadteacherId: staffId } });
  revalidatePath("/[locale]/admin/homegroups", "page");
}

export async function assignHomeroomCounselor(groupId: string, staffId: string | null) {
  await requireSuperAdmin();
  await db.group.update({ where: { id: groupId }, data: { counselorId: staffId } });
  revalidatePath("/[locale]/admin/homegroups", "page");
}

export type RemoveHomegroupResult = { ok: true; done: Exclude<GroupRemoval, "refuse"> } | { ok: false; error: "hasStudents" | "notFound" };

/**
 * «Διαγραφή τμήματος»: remove a group that isn't really a homegroup any more.
 * Deleted outright when nothing points at it; otherwise (inactive students,
 * lessons, history) its homegroup staff are cleared so it stops being listed,
 * and the group itself is kept so no record loses its class. A class with
 * active students is refused. Re-checked here, not trusted from the page.
 */
export async function removeHomegroup(groupId: string): Promise<RemoveHomegroupResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) throw new Error("Forbidden");

  const result = await db.$transaction(async (tx) => {
    const g = await tx.group.findUnique({
      where: { id: groupId },
      select: {
        name: true,
        _count: {
          select: {
            studentGroups: true, courseAssignments: true, referrals: true, referralStudents: true,
            testSchedules: true, substitutionRequests: true, substitutionPlanEntries: true,
            toiletBreaks: true, attendanceExports: true,
          },
        },
      },
    });
    if (!g) return { ok: false as const, error: "notFound" as const };
    const [activeStudents, inactiveStudents, timetableSlots, intercalaryAttendance] = await Promise.all([
      tx.studentProfile.count({ where: { groupId, user: { isActive: true } } }),
      tx.studentProfile.count({ where: { groupId, user: { isActive: false } } }),
      // Removed lessons too: naming removedAt opts out of the current-timetable filter (db.ts).
      tx.timetableSlot.count({ where: { groupId, removedAt: undefined } }),
      tx.attendance.count({ where: { intercalaryGroupId: groupId } }),
    ]);
    const done = groupRemoval({ activeStudents, inactiveStudents, timetableSlots, intercalaryAttendance, ...g._count });
    if (done === "refuse") return { ok: false as const, error: "hasStudents" as const };
    if (done === "delete") await tx.group.delete({ where: { id: groupId } });
    else {
      await tx.group.update({
        where: { id: groupId },
        data: { homeroomTeacherId: null, homeroomHeadteacherId: null, counselorId: null },
      });
    }
    return { ok: true as const, done, name: g.name };
  });

  if (result.ok) {
    await writeAudit({
      userId: auth.userId,
      action: result.done === "delete" ? "group.delete" : "group.unassignHomeroom",
      resource: "Group",
      resourceId: groupId,
      details: { name: result.name },
      ...(await requestMeta()),
    });
    revalidatePath("/[locale]/admin/homegroups", "page");
    return { ok: true, done: result.done };
  }
  return result;
}

export interface GroupImportResult {
  success: boolean;
  assigned: number;
  skipped: string[];
  errors: string[];
}

export async function importGroupAssignments(
  _prev: GroupImportResult | null,
  formData: FormData,
): Promise<GroupImportResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) {
    return { success: false, assigned: 0, skipped: [], errors: ["Unauthorized"] };
  }

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { success: false, assigned: 0, skipped: [], errors: ["No file provided"] };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const wb = XLSX.read(buf, { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "" });

  if (rows.length === 0) {
    return { success: false, assigned: 0, skipped: [], errors: ["File is empty"] };
  }

  // Detect column keys by matching known Greek header fragments
  const headers = Object.keys(rows[0]!);
  const find = (fragment: string) =>
    headers.find((h) => h.toUpperCase().includes(fragment.toUpperCase())) ?? null;

  const colGroup      = find("ΤΜΗΜΑ");
  const colTeacher    = find("ΥΠΕΥΘΥΝ");
  const colHeadB      = find("ΚΗΔΕΜ");
  const colCounselor  = find("ΣΕΑ");

  if (!colGroup) {
    return { success: false, assigned: 0, skipped: [], errors: ["Could not find ΤΜΗΜΑ column"] };
  }

  // Build staffName → staffProfileId lookup from the staff roster the timetable
  // import writes. Resolving through claimed timetable slots instead would only
  // ever find staff who both teach AND have already signed up — which the ΣΕΑ
  // column can never satisfy, since a counselor has no lessons.
  const profiles = await db.staffProfile.findMany({
    where: { scheduleName: { not: null } },
    select: { id: true, scheduleName: true },
  });
  const nameToId = new Map<string, string>(
    profiles.map((p) => [normalize(p.scheduleName!), p.id]),
  );

  // Fetch all groups for name → id lookup
  const groups = await db.group.findMany({ select: { id: true, name: true } });
  const groupNameToId = new Map(groups.map((g) => [g.name.trim(), g.id]));

  const errors: string[] = [];
  const skipped: string[] = [];
  let assigned = 0;

  for (const row of rows) {
    const groupName = String(row[colGroup] ?? "").trim();
    if (!groupName) continue;

    const groupId = groupNameToId.get(groupName);
    if (!groupId) {
      skipped.push(`Group "${groupName}" not found`);
      continue;
    }

    const teacherName   = colTeacher   ? normalize(String(row[colTeacher]  ?? "")) : null;
    const headBName     = colHeadB     ? normalize(String(row[colHeadB]    ?? "")) : null;
    const counselorName = colCounselor ? normalize(String(row[colCounselor] ?? "")) : null;

    const data: {
      homeroomTeacherId?: string | null;
      homeroomHeadteacherId?: string | null;
      counselorId?: string | null;
    } = {};

    if (teacherName) {
      const id = nameToId.get(teacherName);
      if (id) data.homeroomTeacherId = id;
      else errors.push(`Row ${groupName}: teacher "${teacherName}" not found in schedule`);
    }

    if (headBName) {
      const id = nameToId.get(headBName);
      if (id) data.homeroomHeadteacherId = id;
      else errors.push(`Row ${groupName}: headteacher B "${headBName}" not found in schedule`);
    }

    if (counselorName) {
      const id = nameToId.get(counselorName);
      if (id) data.counselorId = id;
      else errors.push(`Row ${groupName}: counselor "${counselorName}" not found in schedule`);
    }

    if (Object.keys(data).length > 0) {
      await db.group.update({ where: { id: groupId }, data });
      assigned++;
    }
  }

  revalidatePath("/[locale]/admin/homegroups", "page");
  return { success: true, assigned, skipped, errors };
}

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}
