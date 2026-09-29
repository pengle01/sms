import { db } from "@/server/db";
import {
  missingStudents,
  parentsLeftWithoutActiveChild,
  reactivatedByImport,
  type ParentLinks,
} from "@/lib/studentImportSync";

export interface MissingStudent {
  profileId: string;
  registry: string;
  name: string;
  group: string | null;
}

/** Active students not in the uploaded file (the preview the admin confirms). */
export async function findMissingStudents(fileRegistries: ReadonlySet<string>): Promise<MissingStudent[]> {
  const active = await db.studentProfile.findMany({
    where: { user: { isActive: true, role: "STUDENT" } },
    select: { id: true, studentId: true, user: { select: { name: true } }, group: { select: { name: true } } },
  });
  return missingStudents(
    active.map((s) => ({ profileId: s.id, registry: s.studentId, name: s.user.name ?? "—", group: s.group?.name ?? null })),
    fileRegistries,
  )
    .map(({ profileId, registry, name, group }) => ({ profileId, registry, name, group }))
    .sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "", "el") || a.name.localeCompare(b.name, "el"));
}

export async function countActiveStudents(): Promise<number> {
  return db.studentProfile.count({ where: { user: { isActive: true, role: "STUDENT" } } });
}

/** The parents of these students, with every child's active state. */
async function parentLinksOf(profileIds: string[]): Promise<ParentLinks[]> {
  const parents = await db.parentProfile.findMany({
    where: { children: { some: { studentProfileId: { in: profileIds } } } },
    select: {
      userId: true,
      user: { select: { isActive: true } },
      children: { select: { studentProfileId: true, studentProfile: { select: { user: { select: { isActive: true } } } } } },
    },
  });
  return parents.map((p) => ({
    parentUserId: p.userId,
    parentActive: p.user.isActive,
    children: p.children.map((c) => ({ profileId: c.studentProfileId, active: c.studentProfile.user.isActive })),
  }));
}

/**
 * Deactivate the confirmed missing students, and parents left with no active
 * child. Re-checks that each id is still an active student. Returns what was
 * actually changed, for the result and the audit log.
 */
export async function deactivateStudents(profileIds: string[]) {
  const students = await db.studentProfile.findMany({
    where: { id: { in: profileIds }, user: { isActive: true, role: "STUDENT" } },
    select: { id: true, studentId: true, userId: true },
  });
  if (students.length === 0) return { students: [], parentUserIds: [] as string[] };

  const removed = new Set(students.map((s) => s.id));
  const parentUserIds = parentsLeftWithoutActiveChild(await parentLinksOf([...removed]), removed);
  const now = new Date();
  await db.$transaction([
    db.user.updateMany({
      where: { id: { in: students.map((s) => s.userId) } },
      data: { isActive: false, deactivatedByImport: now },
    }),
    db.user.updateMany({
      where: { id: { in: parentUserIds }, role: "PARENT", isActive: true },
      data: { isActive: false, deactivatedByImport: now },
    }),
  ]);
  return { students, parentUserIds };
}

/**
 * Bring back students the import had deactivated (they are in the file again),
 * and their parents the import had deactivated with them. Accounts deactivated
 * by hand are never touched.
 */
export async function reactivateImportedStudents(profileIds: string[]): Promise<number> {
  if (profileIds.length === 0) return 0;
  const students = await db.studentProfile.findMany({
    where: { id: { in: profileIds } },
    select: { id: true, userId: true, user: { select: { isActive: true, deactivatedByImport: true } } },
  });
  const back = students.filter((s) =>
    reactivatedByImport({ active: s.user.isActive, deactivatedByImport: s.user.deactivatedByImport }),
  );
  if (back.length === 0) return 0;
  await reactivateWithParents(back.map((s) => s.id), back.map((s) => s.userId));
  return back.length;
}

/** Reactivate students plus their import-deactivated parents; clears the import mark. */
export async function reactivateWithParents(profileIds: string[], studentUserIds: string[]) {
  await db.$transaction([
    db.user.updateMany({
      where: { id: { in: studentUserIds } },
      data: { isActive: true, deactivatedByImport: null },
    }),
    db.user.updateMany({
      where: {
        role: "PARENT",
        isActive: false,
        deactivatedByImport: { not: null },
        parentProfile: { children: { some: { studentProfileId: { in: profileIds } } } },
      },
      data: { isActive: true, deactivatedByImport: null },
    }),
  ]);
}
