"use server";

import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageClaims } from "@/lib/rbac";
import { getActiveAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";
import { db } from "@/server/db";
import { getSchoolYear } from "@/lib/schoolConfig";
import { carriedYearKey } from "@/server/carriedAbsences";
import { parseCarriedAbsenceRows, summarizeCarriedChanges } from "@/lib/carriedAbsences";

async function requireAdmin() {
  const auth = await getActiveAuth();
  if (!auth || !auth.roles.some(canManageClaims)) redirect("/");
  return auth;
}

export type CarriedResult =
  | { ok: true; added: number; changed: number; removed: number; unchanged: number; saved: boolean }
  | { ok: false; error: string; rows?: string[] };

/**
 * Read the sheet and match μητρώα. With `save`, write it: each listed student's
 * number is set (0 removes it); everyone else keeps theirs.
 */
async function process(formData: FormData, save: boolean): Promise<CarriedResult> {
  const auth = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "noFile" };
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]!]!, { defval: "" });
  const parsed = parseCarriedAbsenceRows(rows);
  if (!parsed.ok) return { ok: false, error: parsed.error, rows: parsed.rows };

  const students = await db.studentProfile.findMany({
    where: { studentId: { in: parsed.entries.map((e) => e.registry) } },
    select: { id: true, studentId: true },
  });
  const byRegistry = new Map(students.map((s) => [s.studentId, s.id]));
  const unknown = parsed.entries.filter((e) => !byRegistry.has(e.registry)).map((e) => e.registry);
  if (unknown.length > 0) return { ok: false, error: "unknownRegistry", rows: unknown };

  const schoolYear = carriedYearKey(await getSchoolYear());
  const existingRows = await db.carriedAbsence.findMany({
    where: { schoolYear, studentId: { in: students.map((s) => s.id) } },
    select: { studentId: true, periods: true, student: { select: { studentId: true } } },
  });
  const existing = new Map(existingRows.map((r) => [r.student.studentId, r.periods]));
  const summary = summarizeCarriedChanges(parsed.entries, existing);
  if (!save) return { ok: true, ...summary, saved: false };

  await db.$transaction([
    db.carriedAbsence.deleteMany({
      where: {
        schoolYear,
        studentId: { in: parsed.entries.filter((e) => e.periods === 0).map((e) => byRegistry.get(e.registry)!) },
      },
    }),
    ...parsed.entries
      .filter((e) => e.periods > 0)
      .map((e) =>
        db.carriedAbsence.upsert({
          where: { studentId_schoolYear: { studentId: byRegistry.get(e.registry)!, schoolYear } },
          create: { studentId: byRegistry.get(e.registry)!, schoolYear, periods: e.periods, updatedById: auth.userId },
          update: { periods: e.periods, updatedById: auth.userId },
        }),
      ),
  ]);
  await writeAudit({
    ...(await requestMeta()),
    userId: auth.userId,
    action: "carriedAbsences.upload",
    resource: "CarriedAbsence",
    details: { schoolYear, ...summary },
  });
  revalidatePath("/", "layout");
  return { ok: true, ...summary, saved: true };
}

export async function previewCarriedAbsences(formData: FormData): Promise<CarriedResult> {
  return process(formData, false);
}

export async function saveCarriedAbsences(formData: FormData): Promise<CarriedResult> {
  return process(formData, true);
}

/** Remove every carried-over number, for good. */
export async function deleteAllCarriedAbsences(): Promise<{ ok: true; deleted: number }> {
  const auth = await requireAdmin();
  const { count } = await db.carriedAbsence.deleteMany({});
  await writeAudit({
    ...(await requestMeta()),
    userId: auth.userId,
    action: "carriedAbsences.deleteAll",
    resource: "CarriedAbsence",
    details: { deleted: count },
  });
  revalidatePath("/", "layout");
  return { ok: true, deleted: count };
}
