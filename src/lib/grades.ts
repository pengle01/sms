// Pure grade helpers — no DB imports, safe for client components and unit tests.

// The grading periods a teacher records per lesson. Stored verbatim in
// `Grade.period` (the @@unique([studentId, courseId, period]) key component).
export const GRADE_PERIODS = ["TERM1", "TERM2"] as const;
export type GradePeriod = (typeof GRADE_PERIODS)[number];

export function isGradePeriod(v: string | undefined | null): v is GradePeriod {
  return v === "TERM1" || v === "TERM2";
}

/** Normalize an untrusted `term` query param to a valid grading period. */
export function parseGradePeriod(v: string | undefined | null): GradePeriod {
  return isGradePeriod(v) ? v : "TERM1";
}

export const GRADE_MIN = 0;
export const GRADE_MAX = 20;

export function isValidGradeValue(n: number): boolean {
  return Number.isFinite(n) && n >= GRADE_MIN && n <= GRADE_MAX;
}

/**
 * Parse a raw grade input string. Empty/whitespace means "clear the grade"
 * (returns value: null). Returns ok:false for anything that isn't a number in
 * the 0–20 range.
 */
export function parseGradeInput(
  raw: string
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  const n = Number(trimmed);
  if (!isValidGradeValue(n)) return { ok: false };
  return { ok: true, value: n };
}

/** Tailwind text-colour class for a 0–20 grade. */
export function gradeColorClass(v: number): string {
  if (v >= 17) return "text-green-700";
  if (v >= 13) return "text-emerald-700";
  if (v >= 10) return "text-amber-700";
  return "text-red-700";
}
