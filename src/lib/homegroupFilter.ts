// Pure helpers for the admin homegroups page filters — kept free of Prisma
// imports so they're unit-testable; they return plain `where` fragments.

export type MissingFilter = "teacher" | "headteacher" | "counselor" | "any" | null;

const MISSING_VALUES = ["teacher", "headteacher", "counselor", "any"] as const;

export function parseMissingFilter(v: string | undefined | null): MissingFilter {
  return (MISSING_VALUES as readonly string[]).includes(v ?? "")
    ? (v as MissingFilter)
    : null;
}

/**
 * A "homegroup" is a group that either has homeroom students or has any of
 * the homeroom staff roles assigned. (There is no type column — subject
 * groups have neither.)
 */
export function isHomegroupWhere(): Record<string, unknown> {
  return {
    OR: [
      { students: { some: {} } },
      { homeroomTeacherId: { not: null } },
      { homeroomHeadteacherId: { not: null } },
      { counselorId: { not: null } },
    ],
  };
}

/**
 * Staff filters for the homegroups page. Specific staff filters and the
 * "missing" filter combine with AND (Prisma merges sibling keys).
 */
export function homegroupWhere(params: {
  teacher?: string;
  headteacher?: string;
  counselor?: string;
  missing: MissingFilter;
}): Record<string, unknown> {
  const where: Record<string, unknown> = {};

  if (params.teacher) where.homeroomTeacherId = params.teacher;
  if (params.headteacher) where.homeroomHeadteacherId = params.headteacher;
  if (params.counselor) where.counselorId = params.counselor;

  if (params.missing === "teacher") where.homeroomTeacherId = null;
  else if (params.missing === "headteacher") where.homeroomHeadteacherId = null;
  else if (params.missing === "counselor") where.counselorId = null;
  else if (params.missing === "any") {
    where.OR = [
      { homeroomTeacherId: null },
      { homeroomHeadteacherId: null },
      { counselorId: null },
    ];
  }

  return where;
}
