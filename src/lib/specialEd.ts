// Special-education catalog + pure helpers (unit-tested; no DB).
import type { Role } from "@/generated/prisma/client";
import { matchesSearch } from "@/lib/textSearch";
import { canViewCounselorNotes, isAdminStaff } from "@/lib/rbac";

export type CodeEntry = { code: string; label: string };

// Disability categories — the ministry "Κωδικοί Προβλημάτων" list. Seeded into
// SpecialEdProblemCode; admins may add more rows (the list is open-ended).
export const SPECIAL_ED_PROBLEM_CODES: CodeEntry[] = [
  { code: "Α/ΑΧ", label: "Αυτισμός/Αυτιστικά Χαρακτηριστικά" },
  { code: "ΑΣΥ", label: "Άλλα Σύνδρομα" },
  { code: "ΓΑΔ", label: "Γενικευμένη Αγχώδης Διαταραχή" },
  { code: "ΓΜΔ", label: "Γενικευμένες Μαθησιακές Δυσκολίες" },
  { code: "ΔΑΦ", label: "Διαταραχή Αυτιστικού Φάσματος" },
  { code: "ΔΕΠ/Υ", label: "Διαταραχή Ελλειμματικής Προσοχής/Υπερκινητικότητα" },
  { code: "ΔΞ", label: "Δυσλεξία" },
  { code: "ΔΠ", label: "Δυσπραξία" },
  { code: "ΕΜΔ", label: "Ειδική Μαθησιακή Δυσκολία" },
  { code: "ΕΠ", label: "Εγκεφαλική Παράλυση" },
  { code: "ΜΔ", label: "Μαθησιακές Δυσκολίες" },
  { code: "ΝΥ", label: "Νοητική Υστέρηση" },
  { code: "ΝΥΣ", label: "Νευροαναπτυξιακή καθυστέρηση" },
  { code: "ΟΝ", label: "Οριακή Νοημοσύνη" },
  { code: "ΠΛ", label: "Προβλήματα λόγου" },
  { code: "ΠΣΥΜ", label: "Προβλήματα Συμπεριφοράς" },
  { code: "ΠΥΓ", label: "Προβλήματα Υγείας" },
  { code: "Σ", label: "Συναισθηματικά" },
  { code: "ΣΑ", label: "Σωματική Αναπηρία" },
  { code: "ΣΜΔ", label: "Σοβαρές Μαθησιακές Δυσκολίες" },
  { code: "ΣΝτ", label: "Σύνδρομο Ντάουν" },
  { code: "ΣΥΜ", label: "Συμπεριφοριακά" },
  { code: "Υ", label: "Υγείας" },
];

// Exam/teaching accommodations — the ministry "Κωδικοί Διευκολύνσεων" list (1..18).
export const SPECIAL_ED_ACCOMMODATIONS: CodeEntry[] = [
  { code: "1", label: "Έμφαση στην προφορική επίδοση των τετραμήνων." },
  { code: "2", label: "Στις περιπτώσεις που η ορθογραφία και η στίξη αποτελούν αντικείμενο εξέτασης, παραχωρείται εξαίρεση από τη βαθμολόγησή τους και παρέχεται προσαρμογή βαθμολογίας ως αντιστάθμισμα. Επιείκεια στα συντακτικά και ορθογραφικά λάθη." },
  { code: "3", label: "Πρόσθετος χρόνος εξέτασης. Κατά τα διαγωνίσματα και τις εξετάσεις." },
  { code: "4", label: "Ανάγνωση και απλοποίηση της γλωσσικής διατύπωσης του Εξεταστικού Δοκιμίου προφορικά σε 15΄ λεπτά. Απλοποίηση του εξεταστικού δοκιμίου, νοουμένου ότι αυτό δεν προδιαγράφει την απάντηση." },
  { code: "5", label: "Συνοδός." },
  { code: "6", label: "Χρήση υπολογιστικής μηχανής στα Διαγωνίσματα και στις Εξετάσεις." },
  { code: "7", label: "Χρήση «μεταγραφέα», κατά τις εξετάσεις και τα διαγωνίσματα, μόνο σε περιπτώσεις όπου οι απαντήσεις δεν μπορούν να δοθούν διαφορετικά. Σε τέτοια περίπτωση η καταγραφή των απαντήσεων γίνεται επί λέξει στην παρουσία παρατηρητή. Νοείται ότι ο χρόνος καταγραφής των απαντήσεων δεν αφαιρείται από το συνολικό χρόνο εξέτασης. Μεταγραφέας για καταγραφή των απαντήσεων καθ’ υπαγόρευση των μαθητών/τριών." },
  { code: "8", label: "Εναλλακτικοί τρόποι αξιολόγησης στα Αρχαία." },
  { code: "9", label: "Εναλλακτικοί τρόποι αξιολόγησης στα Αγγλικά." },
  { code: "10", label: "Εναλλακτικοί τρόποι αξιολόγησης στα μη εξεταζόμενα μαθήματα, παράλληλα με τα διαγωνίσματα (όπως μικρές εργασίες)." },
  { code: "11", label: "Τακτικές συναντήσεις με ΣΕΑ για συναισθηματική στήριξη." },
  { code: "12", label: "Μέντορας." },
  { code: "13", label: "Ευέλικτο ωράριο." },
  { code: "14", label: "Μικρά διαλείμματα διάρκειας 20΄ λεπτών. Περίοδοι ανάπαυσης." },
  { code: "15", label: "Χρήση τεχνολογικού εξοπλισμού (Tablet) στην τάξη, Η/Υ, για τις γραπτές εργασίες και στα διαγωνίσματα. Διεκπεραίωση της κατ'οίκον εργασίας στον ΗΥ." },
  { code: "16", label: "Μεγέθυνση γραμμάτων." },
  { code: "17", label: "Γραφέας για πιστή αντιγραφή του τετραδίου απαντήσεων των μαθητών/τριών στο τέλος της εξέτασης." },
  { code: "18", label: "Απαλλαγή από ακρόαση/κατανόηση κειμένου." },
];

export const SPECIAL_ED_CODE_MAX = 10;
export const SPECIAL_ED_LABEL_MAX = 500;

export type ParsedCodeInput =
  | { ok: true; code: string; label: string }
  | { ok: false; error: "code" | "label" };

/** Validate an admin add-code submission (code + human label, both trimmed). */
export function parseSpecialEdCodeInput(code: string, label: string): ParsedCodeInput {
  const c = code.trim();
  if (!c || c.length > SPECIAL_ED_CODE_MAX) return { ok: false, error: "code" };
  const l = label.trim().replace(/\s+/g, " ");
  if (!l || l.length > SPECIAL_ED_LABEL_MAX) return { ok: false, error: "label" };
  return { ok: true, code: c, label: l };
}

/**
 * Split requested codes into the ones present in the catalog and the unknown
 * rest, deduplicated. Both the Excel import and the edit form only ever attach
 * catalog codes — an unknown code in Prisma's nested connect would throw P2025
 * and fail the whole save, so callers filter first and report the dropped ones.
 */
export function splitKnownCodes(
  codes: string[],
  catalog: ReadonlySet<string>,
): { known: string[]; unknown: string[] } {
  const known: string[] = [];
  const unknown: string[] = [];
  for (const code of new Set(codes)) {
    (catalog.has(code) ? known : unknown).push(code);
  }
  return { known, unknown };
}

/**
 * The import/edit features only attach codes that already exist in the lookup
 * tables (SpecialEdProblemCode / SpecialEdAccommodation). When BOTH tables are
 * empty the install was never seeded (scripts/seed-special-ed-codes.mjs) — every
 * code in the file would be silently dropped as "unknown", producing code-less
 * records. Callers should refuse the import in that case rather than import them.
 */
export function specialEdCodesSeeded(problemCount: number, accommodationCount: number): boolean {
  return problemCount > 0 || accommodationCount > 0;
}

export type SupportKind = "ATOMIC" | "GROUP";

/**
 * Classify a timetable group by its support prefix.
 *   ΑΣΤ_… → atomic (one-on-one) support
 *   ΣΤ_…  → group support
 * Returns null for ordinary (non-support) groups. The subject code is the last
 * underscore-separated segment of the group name (e.g. "ΕΛΛ", "ΜΑΘ").
 *
 * Note: ΑΣΤ_ must be tested before ΣΤ_ because "ΑΣΤ" contains "ΣΤ".
 */
export function parseSupportGroup(name: string): { kind: SupportKind; subjectCode: string } | null {
  const n = (name ?? "").trim();
  let kind: SupportKind;
  if (n.startsWith("ΑΣΤ_")) kind = "ATOMIC";
  else if (n.startsWith("ΣΤ_")) kind = "GROUP";
  else return null;
  const parts = n.split("_");
  const subjectCode = parts.length > 1 ? parts[parts.length - 1]!.trim() : "";
  return { kind, subjectCode };
}

/**
 * Full special-ed access (codes + remarks + support): the special-ed deputy,
 * the counselor, the headmaster, and the super admin. Other teachers get a
 * codes-only intentional reveal instead (gated separately by "teaches student").
 */
export function canViewSpecialEdFull(roles: Role[], isSpecialEdDeputy: boolean): boolean {
  if (isSpecialEdDeputy) return true;
  return roles.some(canViewCounselorNotes);
}

/**
 * Who owns the special-ed register: adding a student to it, and the bulk import.
 *
 * Narrower than canViewSpecialEdFull on purpose. The counselor reads the whole
 * dossier as part of their job, but deciding who is IN the cohort belongs to the
 * deputy responsible for special education — and an import rewrites problem
 * codes for everyone at once. The headmaster and the system admin keep it as a
 * fallback so the register is never unreachable if the designation is unset.
 */
export function canManageSpecialEdRegister(roles: Role[], isSpecialEdDeputy: boolean): boolean {
  if (isSpecialEdDeputy) return true;
  return roles.some((r) => r === "HEADMASTER" || isAdminStaff(r));
}

/** The fields the cohort list filters on. */
/** A timetable coordinate of one support lesson. dayOfWeek is 1 (Mon) – 5 (Fri). */
export interface SupportSlot {
  dayOfWeek: number;
  period: number;
}

export interface CohortRow {
  name: string;
  registryNo: string;
  grade: number | null;
  group: string | null;
  problemCodes: string[];
  accommodationCodes: string[];
  /** When this student is in support. Empty when the timetable gives them none. */
  supportSlots: SupportSlot[];
}

export interface CohortFilter {
  /** Year 1-3, or undefined for all. */
  grade?: number;
  /** A single problem code, or undefined for all. */
  code?: string;
  /** A single accommodation code (διευκόλυνση), or undefined for all. */
  accommodation?: string;
  /** Weekday 1-5 (1 = Monday), matching TimetableSlot.dayOfWeek. */
  day?: number;
  /** A period within `day`. Ignored on its own — see filterCohort. */
  period?: number;
  /** Free text over the name and the registry number. */
  q?: string;
}

/**
 * Narrow the special-ed cohort.
 *
 * Filtering happens in memory rather than in the query: the cohort is one row
 * per student with a record — dozens, not thousands — and it is already loaded
 * whole to build the code legend. Keeping it pure also makes the awkward part
 * testable, which is the accent-insensitive name match: a Greek name typed
 * without accents, or with a final ς where the record has σ, must still hit.
 */
export function filterCohort<T extends CohortRow>(rows: T[], f: CohortFilter): T[] {
  const q = (f.q ?? "").trim();
  return rows.filter((r) => {
    if (f.grade != null && r.grade !== f.grade) return false;
    if (f.code && !r.problemCodes.includes(f.code)) return false;
    if (f.accommodation && !r.accommodationCodes.includes(f.accommodation)) return false;
    // A period only means something inside a day: the same period number falls on
    // a different lesson each weekday, so `?period=3` alone is ignored rather
    // than guessed at. The UI only offers periods once a day is chosen.
    if (f.day != null) {
      const hit = r.supportSlots.some(
        (s) => s.dayOfWeek === f.day && (f.period == null || s.period === f.period),
      );
      if (!hit) return false;
    }
    if (q && !matchesSearch(r.name, q) && !matchesSearch(r.registryNo, q)) return false;
    return true;
  });
}

/** Problem codes actually present in a cohort, sorted — the filter's options. */
export function cohortCodes(rows: CohortRow[]): string[] {
  return [...new Set(rows.flatMap((r) => r.problemCodes))].sort((a, b) => a.localeCompare(b, "el"));
}

/**
 * Accommodation codes present in a cohort. Sorted numerically, not
 * lexically — they are "1".."18", so a string sort would put 10 before 2.
 * Same rule specialEdLegend uses.
 */
export function cohortAccommodations(rows: CohortRow[]): string[] {
  return [...new Set(rows.flatMap((r) => r.accommodationCodes))].sort((a, b) => Number(a) - Number(b));
}

/**
 * Weekdays on which anyone in the cohort has support — the day pills.
 *
 * Counts STUDENTS, not lessons: a student with two Wednesday periods is one
 * Wednesday student, because the pill filters people. Feed it the unfiltered
 * cohort so a day never disappears because of the current selection.
 */
export function cohortSupportDays(rows: CohortRow[]): { day: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const r of rows) {
    for (const day of new Set(r.supportSlots.map((s) => s.dayOfWeek))) {
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day - b.day);
}

/**
 * Periods that actually carry support on one weekday — the period pills.
 * Offering a period with nothing in it would be a dead end, and the periods in
 * the timetable run past the configured length of the school day, so the
 * options come from the slots rather than from periodsForDow.
 */
export function cohortSupportPeriods(
  rows: CohortRow[],
  day: number,
): { period: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const r of rows) {
    const periods = new Set(
      r.supportSlots.filter((s) => s.dayOfWeek === day).map((s) => s.period),
    );
    for (const p of periods) counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return [...counts]
    .map(([period, count]) => ({ period, count }))
    .sort((a, b) => a.period - b.period);
}

/**
 * The roster's URL keys — carried by the filter pills and by every row link, so
 * a record's back button returns to the list you came from. One list, because
 * the page and the record page both serialise it and could otherwise drift.
 */
export const COHORT_KEYS = ["grade", "code", "acc", "day", "period", "q"] as const;
