"use server";

import { revalidatePath } from "next/cache";
import { getSuperAdminAuth } from "@/server/authz";
import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma";
import { enrollmentSyncPlan } from "@/lib/enrollmentSync";
import * as XLSX from "xlsx";

export interface EnrollmentImportResult {
  success: boolean;
  studentsEnrolled: number;
  linksCreated: number;
  linksRemoved: number;
  errors: string[];
}

export async function importEnrollment(
  _prev: EnrollmentImportResult | null,
  formData: FormData,
): Promise<EnrollmentImportResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) {
    return { success: false, studentsEnrolled: 0, linksCreated: 0, linksRemoved: 0, errors: ["Unauthorized"] };
  }

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { success: false, studentsEnrolled: 0, linksCreated: 0, linksRemoved: 0, errors: ["No file provided"] };
  }

  const buffer   = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet    = workbook.Sheets[workbook.SheetNames[0]!]!;
  const rows     = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" }) as string[][];

  let studentsEnrolled = 0, linksCreated = 0, linksRemoved = 0;
  const errors: string[] = [];

  // Pre-load all known group names into a cache for fast lookup.
  const groupCache = new Map<string, string>(); // name → id
  const allGroups = await db.group.findMany({ select: { id: true, name: true } });
  for (const g of allGroups) groupCache.set(g.name, g.id);

  // Row 0 is the header; skip it.
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const name        = String(row[0] ?? "").trim();
    const registryRaw = String(row[1] ?? "").trim();

    if (!name || !registryRaw) continue; // blank row

    // Col 1 comes in as a number from Excel — normalise to string.
    const registryId = registryRaw.replace(/\.0+$/, "");

    try {
      const student = await db.studentProfile.findUnique({
        where: { studentId: registryId },
        select: { id: true },
      });

      if (!student) {
        errors.push(`Row ${i + 1} (${name} / ${registryId}): student not found`);
        continue;
      }

      // All group codes start at col 4 and continue to end of row. Deduplicate
      // within the row; flag any code not already in the DB.
      const seen = new Set<string>();
      const codes = row
        .slice(4)
        .map((c) => String(c).trim())
        .filter((c) => c !== "" && !seen.has(c) && seen.add(c));

      let rowComplete = true;
      const targetGroupIds: string[] = [];
      for (const code of codes) {
        const groupId = groupCache.get(code);
        if (!groupId) {
          errors.push(`Row ${i + 1} (${name}): group "${code}" not found — import the schedule first`);
          rowComplete = false; // incomplete target → sync will only add, never remove
          continue;
        }
        targetGroupIds.push(groupId);
      }

      // Sync this student's subject-group links to match the file: add the ones
      // in the row, remove the stale ones. Removal is suppressed on an incomplete
      // or empty row (see enrollmentSyncPlan) so a typo can't wipe enrollments.
      const current = await db.studentGroup.findMany({
        where: { studentProfileId: student.id },
        select: { groupId: true },
      });
      const { toAdd, toRemove } = enrollmentSyncPlan(
        current.map((g) => g.groupId),
        targetGroupIds,
        rowComplete,
      );

      if (toAdd.length > 0) {
        await db.studentGroup.createMany({
          data: toAdd.map(
            (groupId) => ({ studentProfileId: student.id, groupId }) as Prisma.StudentGroupUncheckedCreateInput,
          ),
          skipDuplicates: true,
        });
        linksCreated += toAdd.length;
      }
      if (toRemove.length > 0) {
        const del = await db.studentGroup.deleteMany({
          where: { studentProfileId: student.id, groupId: { in: toRemove } },
        });
        linksRemoved += del.count;
      }

      studentsEnrolled++; // count every matched student; errors surface the detail
    } catch (err) {
      errors.push(
        `Row ${i + 1} (${name}): ` +
        (err instanceof Error ? err.message : String(err))
      );
    }
  }

  // Enrollment feeds rosters, attendance, locate and special-ed support across
  // every portal — refresh broadly so changes show without a manual reload.
  // (Previously omitted, so added/removed enrollments appeared stale.)
  if (linksCreated > 0 || linksRemoved > 0) revalidatePath("/", "layout");

  return { success: true, studentsEnrolled, linksCreated, linksRemoved, errors };
}
