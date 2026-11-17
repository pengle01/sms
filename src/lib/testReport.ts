// Pure helpers for test grading status and the Κ9 «Αποτελέσματα Διαγωνίσματος»
// form — no DB imports, safe for client components and unit tests.

/** The Κ9 form's grade bands, in print order. */
export const GRADE_BANDS = ["1-9", "10-12", "13-15", "16-18", "19-20"] as const;
export type GradeBand = (typeof GRADE_BANDS)[number];

/**
 * The Κ9 band a test grade falls in. Half grades round up (9.5 → 10-12,
 * 12.5 → 13-15). A 0 goes in the lowest band.
 */
export function gradeBand(value: number): GradeBand {
  const r = Math.floor(value + 0.5);
  if (r <= 9) return "1-9";
  if (r <= 12) return "10-12";
  if (r <= 15) return "13-15";
  if (r <= 18) return "16-18";
  return "19-20";
}

/** Count per band plus the total of graded students; blanks are ignored. */
export function gradeBands(values: readonly (number | null | undefined)[]): {
  counts: Record<GradeBand, number>;
  total: number;
} {
  const counts = Object.fromEntries(GRADE_BANDS.map((b) => [b, 0])) as Record<GradeBand, number>;
  let total = 0;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    counts[gradeBand(v)]++;
    total++;
  }
  return { counts, total };
}

/** Minutes a test lasts: SMALL 20΄, BIG 45΄ per period. */
export function testDurationMinutes(type: "BIG" | "SMALL", periodCount: number): number {
  return type === "SMALL" ? 20 : 45 * Math.max(1, periodCount);
}

export type GradingStatus =
  | { kind: "upcoming" }
  | { kind: "none" }
  | { kind: "partial"; graded: number; total: number }
  | { kind: "done"; graded: number; total: number };

/**
 * Whether a test has its grades: nothing to say before the test day; then no
 * grades, some (graded/total) or all. `graded` counts non-blank values only.
 */
export function gradingStatus(graded: number, total: number, isPast: boolean): GradingStatus {
  if (!isPast) return { kind: "upcoming" };
  if (graded <= 0) return { kind: "none" };
  if (graded < total) return { kind: "partial", graded, total };
  return { kind: "done", graded, total };
}

/**
 * Who may open a test's grades. The owner edits them. A deputy heading the
 * homegroup of at least one of the test's students reads them — only those
 * students'. Anyone else: no access.
 */
export function testGradeAccess(input: {
  viewerStaffId: string;
  testStaffId: string;
  /** Homegroups the viewer heads (Group.homeroomHeadteacherId). */
  headGroupIds: readonly string[];
  /** The test's students with their homegroup. */
  students: readonly { id: string; groupId: string | null }[];
}): { mode: "owner" } | { mode: "deputy"; studentIds: string[] } | { mode: "none" } {
  if (input.viewerStaffId === input.testStaffId) return { mode: "owner" };
  const heads = new Set(input.headGroupIds);
  const studentIds = input.students.filter((s) => s.groupId != null && heads.has(s.groupId)).map((s) => s.id);
  return studentIds.length > 0 ? { mode: "deputy", studentIds } : { mode: "none" };
}

/** Average of the non-blank values, to one decimal; null when there are none. */
export function averageGrade(values: readonly (number | null | undefined)[]): number | null {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x));
  if (v.length === 0) return null;
  return Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10;
}
