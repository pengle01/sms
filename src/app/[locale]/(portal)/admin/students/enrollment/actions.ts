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
    return { success: false, studentsEnrolled: 0, linksCreated: 0, linksRemoved: 0, errors: ["Χωρίς εξουσιοδότηση"] };
  }

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { success: false, studentsEnrolled: 0, linksCreated: 0, linksRemoved: 0, errors: ["Δεν επιλέχθηκε αρχείο"] };
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

  // Parse every row up front so the DB work can run as a few batched queries
  // instead of a round-trip per student (the real file has ~1000 rows).
  // Row 0 is the header. Group codes start at col 4; deduplicate within the row.
  const parsed: { line: number; name: string; registryId: string; codes: string[] }[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const name        = String(row[0] ?? "").trim();
    const registryRaw = String(row[1] ?? "").trim();
    if (!name || !registryRaw) continue; // blank row

    const seen = new Set<string>();
    parsed.push({
      line: i + 1,
      name,
      // Col 1 comes in as a number from Excel — normalise to string.
      registryId: registryRaw.replace(/\.0+$/, ""),
      codes: row
        .slice(4)
        .map((c) => String(c).trim())
        .filter((c) => c !== "" && !seen.has(c) && seen.add(c)),
    });
  }

  // Every group id the file mentions anywhere. Removal is scoped to this set:
  // the file is only authoritative for the kinds of groups it carries, so a
  // link to a group it never mentions (e.g. a support group assigned by hand
  // or by the admin checks tool) is never deleted by a re-import.
  const fileGroupIds = new Set<string>();
  for (const r of parsed) {
    for (const code of r.codes) {
      const id = groupCache.get(code);
      if (id) fileGroupIds.add(id);
    }
  }

  // Batched lookups: registry number → profile id, then all current links.
  const students = await db.studentProfile.findMany({
    where: { studentId: { in: parsed.map((r) => r.registryId) } },
    select: { id: true, studentId: true },
  });
  const profileByRegistry = new Map(students.map((s) => [s.studentId, s.id]));
  const currentLinks = await db.studentGroup.findMany({
    where: { studentProfileId: { in: students.map((s) => s.id) } },
    select: { studentProfileId: true, groupId: true },
  });
  const currentByProfile = new Map<string, string[]>();
  for (const l of currentLinks) {
    const list = currentByProfile.get(l.studentProfileId) ?? [];
    list.push(l.groupId);
    currentByProfile.set(l.studentProfileId, list);
  }

  // Plan every student's sync in memory: add the groups in their row, remove
  // the stale ones. Removal is suppressed on an incomplete or empty row and
  // scoped to groups the file mentions (see enrollmentSyncPlan) so a typo or
  // a partial export can't wipe enrollments.
  const addLinks: Prisma.StudentGroupUncheckedCreateInput[] = [];
  const removals: { studentProfileId: string; groupIds: string[] }[] = [];
  for (const r of parsed) {
    const profileId = profileByRegistry.get(r.registryId);
    if (!profileId) {
      errors.push(`Γραμμή ${r.line} (${r.name} / ${r.registryId}): ο μαθητής δεν βρέθηκε`);
      continue;
    }

    let rowComplete = true;
    const targetGroupIds: string[] = [];
    for (const code of r.codes) {
      const groupId = groupCache.get(code);
      if (!groupId) {
        errors.push(`Γραμμή ${r.line} (${r.name}): το τμήμα «${code}» δεν βρέθηκε — εισάγετε πρώτα το ωρολόγιο πρόγραμμα`);
        rowComplete = false; // incomplete target → sync will only add, never remove
        continue;
      }
      targetGroupIds.push(groupId);
    }

    const { toAdd, toRemove } = enrollmentSyncPlan(
      currentByProfile.get(profileId) ?? [],
      targetGroupIds,
      rowComplete,
      fileGroupIds,
    );
    for (const groupId of toAdd) addLinks.push({ studentProfileId: profileId, groupId });
    if (toRemove.length > 0) removals.push({ studentProfileId: profileId, groupIds: toRemove });
    studentsEnrolled++; // count every matched student; errors surface the detail
  }

  try {
    if (addLinks.length > 0) {
      const created = await db.studentGroup.createMany({ data: addLinks, skipDuplicates: true });
      linksCreated = created.count;
    }
    // deleteMany can't key on (student, group) pairs directly, so batch the
    // pair conditions through OR in chunks instead of one query per student.
    const CHUNK = 100;
    for (let i = 0; i < removals.length; i += CHUNK) {
      const del = await db.studentGroup.deleteMany({
        where: {
          OR: removals.slice(i, i + CHUNK).map((r) => ({
            studentProfileId: r.studentProfileId,
            groupId: { in: r.groupIds },
          })),
        },
      });
      linksRemoved += del.count;
    }
  } catch (err) {
    errors.push("Η εισαγωγή απέτυχε κατά την εγγραφή: " + (err instanceof Error ? err.message : String(err)));
    if (linksCreated > 0 || linksRemoved > 0) revalidatePath("/", "layout");
    return { success: false, studentsEnrolled, linksCreated, linksRemoved, errors };
  }

  // Enrollment feeds rosters, attendance, locate and special-ed support across
  // every portal — refresh broadly so changes show without a manual reload.
  // (Previously omitted, so added/removed enrollments appeared stale.)
  if (linksCreated > 0 || linksRemoved > 0) revalidatePath("/", "layout");

  return { success: true, studentsEnrolled, linksCreated, linksRemoved, errors };
}
