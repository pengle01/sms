"use server";

import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageClaims } from "@/lib/rbac";
import { getActiveAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";
import { db } from "@/server/db";
import { chaperoneEntriesFromRows, chaperoneNameKey } from "@/lib/chaperone";

async function requireAdmin() {
  const auth = await getActiveAuth();
  if (!auth || !auth.roles.some(canManageClaims)) redirect("/");
  return auth;
}

export type ChaperoneListResult =
  | { ok: true; chaperones: number; students: number; unknown: string[]; skipped: number }
  | { ok: false; error: "noFile" | "empty" | "noRegistryColumn" | "noNameColumn" | "noneMatched" };

/**
 * «Συνοδοί»: the uploaded sheet (chaperone name + student «Αρ. Μητρώου» per row)
 * becomes the whole list. Each chaperone account then sees the students listed
 * under its name. A sheet matching no student is refused rather than emptying
 * the list.
 */
export async function uploadChaperoneList(_prev: ChaperoneListResult | null, formData: FormData): Promise<ChaperoneListResult> {
  const auth = await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "noFile" };

  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]!]!, { defval: "" });
  const parsed = chaperoneEntriesFromRows(rows);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const students = await db.studentProfile.findMany({
    where: { studentId: { in: [...new Set(parsed.entries.map((e) => e.registry))] } },
    select: { id: true, studentId: true },
  });
  const byRegistry = new Map(students.map((s) => [s.studentId, s.id]));
  const data = parsed.entries
    .filter((e) => byRegistry.has(e.registry))
    .map((e) => ({ name: e.name, nameKey: chaperoneNameKey(e.name), studentId: byRegistry.get(e.registry)! }));
  if (data.length === 0) return { ok: false, error: "noneMatched" };

  await db.$transaction([
    db.chaperoneListEntry.deleteMany({}),
    db.chaperoneListEntry.createMany({ data, skipDuplicates: true }),
  ]);
  const unknown = [...new Set(parsed.entries.filter((e) => !byRegistry.has(e.registry)).map((e) => e.registry))];
  const chaperones = new Set(data.map((d) => d.nameKey)).size;
  const listedStudents = new Set(data.map((d) => d.studentId)).size;
  await writeAudit({
    ...(await requestMeta()),
    userId: auth.userId,
    action: "chaperone.listUpload",
    resource: "ChaperoneListEntry",
    details: { chaperones, students: listedStudents, unknown: unknown.length, skipped: parsed.skipped },
  });
  revalidatePath("/", "layout");
  return { ok: true, chaperones, students: listedStudents, unknown, skipped: parsed.skipped };
}
