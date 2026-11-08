// Timetable import: a teacher who left hands over to whoever replaces them.
// Ongoing duties move (homegroups, tests, duty posts, rooms, the designations the
// admin ticks); official records (attendance, referrals, permits, awards, audit)
// stay under the name of whoever did them. Pure rules, unit-tested; applied by
// src/server/teacherHandover.ts.

export const HANDOVER_DESIGNATIONS = [
  "specialEducation",
  "substitutionCoordinator",
  "ddkCoordinator",
  "disciplinaryCouncil",
  "itMaintenance",
  "itManager",
  "parentMessaging",
] as const;
export type HandoverDesignation = (typeof HANDOVER_DESIGNATIONS)[number];

export interface HandoverEntry {
  /** Timetable name of the teacher who left. */
  left: string;
  /** Timetable name of the replacement; null = no replacement. */
  replacement: string | null;
  /** Designations that move to the replacement. */
  designations: HandoverDesignation[];
  deactivateLogin: boolean;
}

/** The subject part of a timetable name: "ΗΥ-ΜΑΣΙΑ Μ. ΒΔ" → "ΗΥ". */
export function subjectPrefix(name: string): string | null {
  const i = name.indexOf("-");
  return i > 0 ? name.slice(0, i).trim() : null;
}

/** Preselect a replacement only when exactly one newcomer teaches the same subject. */
export function suggestReplacement(left: string, newNames: readonly string[]): string | null {
  const subject = subjectPrefix(left);
  if (!subject) return null;
  const same = newNames.filter((n) => subjectPrefix(n) === subject);
  return same.length === 1 ? same[0]! : null;
}

/**
 * Read the form's choices, keeping only what this import allows: a teacher who
 * really left, one row each, a replacement named in the file. A designation or
 * replacement that doesn't apply is dropped rather than trusted.
 */
export function parseHandover(
  raw: string | null | undefined,
  left: readonly string[],
  namesInFile: ReadonlySet<string>,
): HandoverEntry[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const allowedLeft = new Set(left);
  const seen = new Set<string>();
  const out: HandoverEntry[] = [];
  for (const row of data as Record<string, unknown>[]) {
    const name = typeof row?.left === "string" ? row.left : null;
    if (!name || !allowedLeft.has(name) || seen.has(name)) continue;
    seen.add(name);
    const replacement =
      typeof row.replacement === "string" && namesInFile.has(row.replacement) && row.replacement !== name
        ? row.replacement
        : null;
    const ticked = Array.isArray(row.designations) ? row.designations : [];
    out.push({
      left: name,
      replacement,
      designations: replacement ? HANDOVER_DESIGNATIONS.filter((d) => ticked.includes(d)) : [],
      deactivateLogin: row.deactivateLogin === true,
    });
  }
  return out;
}

/**
 * Who takes a test the departing teacher scheduled: the person who now teaches
 * that class and course (the replacement or an existing colleague). With nobody
 * or several teaching it, the replacement; null leaves it where it is.
 */
export function testOwnerAfter(teachersNow: readonly string[], replacement: string | null): string | null {
  const distinct = [...new Set(teachersNow)];
  if (replacement && distinct.includes(replacement)) return replacement;
  if (distinct.length === 1) return distinct[0]!;
  return replacement;
}

/** A login the handover must never switch off: the acting admin's, or any admin's. */
export function mayDeactivateLogin(input: {
  targetUserId: string;
  actorUserId: string;
  targetRole: string;
  targetExtraRoles: readonly string[];
}): boolean {
  if (input.targetUserId === input.actorUserId) return false;
  return input.targetRole !== "SUPER_ADMIN" && !input.targetExtraRoles.includes("SUPER_ADMIN");
}
