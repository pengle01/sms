// The ΔΔΚ coordinator's list of filed activities: every activity, whether it was
// converted to ΔΔΚ points yet, and the filters. Pure — the URL in, a Prisma
// where-clause out; unit-tested.

import { DDK_CATALOG } from "@/lib/ddk";

export type DdkActivityStatus = "all" | "converted" | "pending";

export interface DdkActivityFilters {
  status: DdkActivityStatus;
  /** A filer's StaffProfile id. */
  filer: string | null;
  /** A catalogue code («A4a»), or a whole section as «section:A». */
  category: string | null;
  grade: number | null;
  groupId: string | null;
  /** A participant's name or registry number. */
  q: string;
}

const clean = (v: string | undefined) => (v ?? "").trim() || null;

export function parseDdkActivityFilters(sp: Record<string, string | undefined>): DdkActivityFilters {
  const status = sp.status === "converted" || sp.status === "pending" ? sp.status : "all";
  const grade = Number(sp.grade);
  const category = clean(sp.category);
  const validCategory =
    category && (DDK_CATALOG.some((c) => c.code === category) || /^section:[A-Z]$/.test(category)) ? category : null;
  return {
    status,
    filer: clean(sp.filer),
    category: validCategory,
    grade: [1, 2, 3].includes(grade) ? grade : null,
    groupId: clean(sp.groupId),
    q: (sp.q ?? "").trim(),
  };
}

/** The catalogue codes a category filter stands for. */
export function categoryCodes(category: string): string[] {
  if (category.startsWith("section:")) {
    const key = category.slice("section:".length);
    return DDK_CATALOG.filter((c) => c.section === key).map((c) => c.code);
  }
  return [category];
}

/**
 * Activities matching the filters. A category implies converted; «pending»
 * means no ΔΔΚ points yet. Class and student filters look at the participants.
 */
export function ddkActivityWhere(f: DdkActivityFilters) {
  const participant = {
    ...(f.groupId ? { groupId: f.groupId } : f.grade ? { group: { grade: f.grade } } : {}),
    ...(f.q
      ? {
          OR: [
            { user: { name: { contains: f.q, mode: "insensitive" as const } } },
            { studentId: { contains: f.q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };
  const and: Record<string, unknown>[] = [];
  if (f.filer) and.push({ filerId: f.filer });
  if (f.category) and.push({ ddkAwards: { some: { categoryCode: { in: categoryCodes(f.category) } } } });
  else if (f.status === "converted") and.push({ ddkAwards: { some: {} } });
  if (f.status === "pending") and.push({ ddkAwards: { none: {} } });
  if (Object.keys(participant).length > 0) and.push({ participants: { some: { student: participant } } });
  return and.length > 0 ? { AND: and } : {};
}

export interface ActivityAward {
  points: number;
  categoryCode: string;
  student: { groupId: string | null; grade: number | null; name: string; registryNo: string };
}

/** Whether a filter narrows the list to some students (class, year or name). */
export function hasStudentScope(f: Pick<DdkActivityFilters, "grade" | "groupId" | "q">): boolean {
  return !!(f.groupId || f.grade || f.q);
}

function inScope(s: ActivityAward["student"], f: Pick<DdkActivityFilters, "grade" | "groupId" | "q">): boolean {
  if (f.groupId ? s.groupId !== f.groupId : f.grade ? s.grade !== f.grade : false) return false;
  if (!f.q) return true;
  const q = f.q.toLowerCase();
  return s.name.toLowerCase().includes(q) || s.registryNo.toLowerCase().includes(q);
}

/**
 * An activity's ΔΔΚ: total points, students, the spread per student (teachers
 * set points per student), and — with a class or student filter — the points of
 * the matching students alone, which are what a class report adds up.
 */
export function summarizeActivityAwards(
  awards: readonly ActivityAward[],
  f: Pick<DdkActivityFilters, "grade" | "groupId" | "q">,
): {
  category: string | null;
  total: number;
  students: number;
  min: number;
  max: number;
  scoped: { students: number; points: number } | null;
} {
  const points = awards.map((a) => a.points);
  const scopedAwards = hasStudentScope(f) ? awards.filter((a) => inScope(a.student, f)) : null;
  return {
    category: awards[0]?.categoryCode ?? null,
    total: points.reduce((s, p) => s + p, 0),
    students: awards.length,
    min: points.length ? Math.min(...points) : 0,
    max: points.length ? Math.max(...points) : 0,
    scoped: scopedAwards
      ? { students: scopedAwards.length, points: scopedAwards.reduce((s, a) => s + a.points, 0) }
      : null,
  };
}
