"use server";

import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";

async function requireSuperAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "SUPER_ADMIN") throw new Error("Forbidden");
}

export async function assignHomeroomTeacher(groupId: string, staffId: string | null) {
  await requireSuperAdmin();
  await db.group.update({ where: { id: groupId }, data: { homeroomTeacherId: staffId } });
  revalidatePath("/[locale]/admin/groups", "page");
}

export async function assignHomeroomHeadteacher(groupId: string, staffId: string | null) {
  await requireSuperAdmin();
  await db.group.update({ where: { id: groupId }, data: { homeroomHeadteacherId: staffId } });
  revalidatePath("/[locale]/admin/groups", "page");
}

export async function assignHomeroomCounselor(groupId: string, staffId: string | null) {
  await requireSuperAdmin();
  await db.group.update({ where: { id: groupId }, data: { counselorId: staffId } });
  revalidatePath("/[locale]/admin/groups", "page");
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
  const session = await getServerSession(authOptions);
  if (session?.user?.role !== "SUPER_ADMIN") {
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

  // Build staffName → staffProfileId lookup from timetable slots
  const slots = await db.timetableSlot.findMany({
    where: { staffName: { not: null }, staffId: { not: null } },
    select: { staffName: true, staffId: true },
    distinct: ["staffName"],
  });
  const nameToId = new Map<string, string>(
    slots.map((s) => [normalize(s.staffName!), s.staffId!]),
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

  revalidatePath("/[locale]/admin/groups", "page");
  return { success: true, assigned, skipped, errors };
}

function normalize(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}
