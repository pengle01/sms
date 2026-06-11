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
/** Pass mark on the 0–20 scale (the single source of truth). */
export const GRADE_PASS = 10;

export function isValidGradeValue(n: number): boolean {
  return Number.isFinite(n) && n >= GRADE_MIN && n <= GRADE_MAX;
}

/** A grade is passing at or above the pass mark. */
export function isPassing(v: number): boolean {
  return v >= GRADE_PASS;
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
