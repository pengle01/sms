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

/** Test grades: 0–20. */
export const GRADE_MIN = 0;
export const GRADE_MAX = 20;
/** Term grades (Βαθμολογίες Τετραμήνων) start at 1: the scale is 1–20. */
export const TERM_GRADE_MIN = 1;
/** Pass mark on the 20-point scale (the single source of truth). */
export const GRADE_PASS = 10;

export function isValidGradeValue(n: number, min: number = GRADE_MIN): boolean {
  return Number.isFinite(n) && n >= min && n <= GRADE_MAX;
}

/** A grade is passing at or above the pass mark. */
export function isPassing(v: number): boolean {
  return v >= GRADE_PASS;
}

/**
 * Parse a raw grade input string. Empty/whitespace means "clear the grade"
 * (returns value: null). Returns ok:false for anything that isn't a number in
 * the min–20 range — 0–20 for tests, 1–20 for term grades (TERM_GRADE_MIN).
 */
export function parseGradeInput(
  raw: string,
  min: number = GRADE_MIN
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: true, value: null };
  const n = Number(trimmed);
  if (!isValidGradeValue(n, min)) return { ok: false };
  return { ok: true, value: n };
}

/** Tailwind text-colour class for a grade on the 20-point scale. */
export function gradeColorClass(v: number): string {
  if (v >= 17) return "text-green-700";
  if (v >= 13) return "text-emerald-700";
  if (v >= GRADE_PASS) return "text-amber-700";
  return "text-red-700";
}

// ─── Term locking ─────────────────────────────────────────────────────────────
// Grade entry stays FROZEN until the super admin unlocks the term in Settings.

export type GradesUnlocked = Record<GradePeriod, boolean>;
export const GRADES_UNLOCKED_KEY = "grades_unlocked";

/** Parse the stored unlock state; missing/invalid config means all terms locked. */
export function parseGradesUnlocked(raw: string | null | undefined): GradesUnlocked {
  const out: GradesUnlocked = { TERM1: false, TERM2: false };
  if (!raw) return out;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      for (const p of GRADE_PERIODS) {
        const v = (parsed as Record<string, unknown>)[p];
        if (typeof v === "boolean") out[p] = v;
      }
    }
  } catch {
    // default: locked
  }
  return out;
}
