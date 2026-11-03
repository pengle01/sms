import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { chaperoneNameKey } from "@/lib/chaperone";
import { guardianSeesGrades } from "@/lib/rbac";

/** The students listed under this chaperone's name on the admin's list, by name. */
export async function chaperoneStudentIds(userId: string): Promise<string[]> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { name: true } });
  const nameKey = chaperoneNameKey(user?.name);
  if (!nameKey) return [];
  const entries = await db.chaperoneListEntry.findMany({
    where: { nameKey, student: { user: { isActive: true } } },
    select: { studentId: true },
    orderBy: { student: { user: { name: "asc" } } },
  });
  return [...new Set(entries.map((e) => e.studentId))];
}

/**
 * Who is looking at a student's attendance / grades / tests: a parent (their
 * linked children) or a chaperone (the students listed under their name). `home` is the
 * portal's student list — where a page sends them back. Anyone else goes to
 * the login page. `canSeeGrades`: parents yes; chaperones never see a grade —
 * neither term grades nor test marks.
 */
export async function guardianAccess(
  locale: string,
): Promise<{ userId: string; home: string; studentIds: Set<string>; canSeeGrades: boolean }> {
  const auth = await getActiveAuth();
  if (auth?.role === "PARENT") {
    const parent = await db.parentProfile.findUnique({
      where: { userId: auth.userId },
      select: { children: { select: { studentProfileId: true } } },
    });
    return {
      userId: auth.userId,
      home: `/${locale}/parent/children`,
      studentIds: new Set(parent?.children.map((c) => c.studentProfileId) ?? []),
      canSeeGrades: guardianSeesGrades("PARENT"),
    };
  }
  if (auth?.role === "CHAPERONE") {
    return {
      userId: auth.userId,
      home: `/${locale}/chaperone/students`,
      studentIds: new Set(await chaperoneStudentIds(auth.userId)),
      canSeeGrades: guardianSeesGrades("CHAPERONE"),
    };
  }
  redirect(`/${locale}/login/parent`);
}
