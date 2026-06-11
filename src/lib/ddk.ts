// ΔΔΚ — Δημιουργικότητα · Δράση · Κοινωνική Προσφορά
// The Ministry's "Οδηγός Αξιολόγησης μαθητή στο Δ.Δ.Κ.": a fixed catalog of
// contribution categories, each worth a fixed number of units (μονάδες), a
// range ("1-3 ανάλογα"), or a per-participation value ("1 ανά συμμετοχή").
// Pure data + helpers — no DB, no React — so it can be unit-tested and shared
// by the conversion UI, the student profile and the coordinator's reports.

export type DdkPointSpec =
  | { kind: "fixed"; value: number }
  | { kind: "range"; min: number; max: number }
  | { kind: "per"; value: number };

export interface DdkCategory {
  /** Stable catalog code, e.g. "A4a". Stored on DdkAward.categoryCode. */
  code: string;
  /** Section key (Greek letter) — groups categories on screen and in print. */
  section: string;
  label: string;
  /** Extra guidance shown under the option (the guide's footnotes/rules). */
  hint?: string;
  spec: DdkPointSpec;
  /** Computed automatically (not awarded by hand) — excluded from the picker. */
  autoOnly?: boolean;
}

export interface DdkSection {
  key: string;
  label: string;
}

// The eight sections of the guide (Greek lettering, in the printed order).
export const DDK_SECTIONS: DdkSection[] = [
  { key: "A", label: "Α. Γενικές Δραστηριότητες του Σχολείου" },
  { key: "B", label: "Β. Προγράμματα Ευρωπαϊκά / Περιβαλλοντικά / Άλλα" },
  { key: "C", label: "Γ. Σχολικές Εκδηλώσεις" },
  { key: "D", label: "Δ. Διαγωνισμοί Εγκεκριμένοι από το ΥΠΠ" },
  { key: "E", label: "Ε. Συνέδρια / Ημερίδες" },
  { key: "Z", label: "Ζ. Αθλητικές Δραστηριότητες" },
  { key: "H", label: "Η. Εθελοντισμός / Προσφορά Υπηρεσιών" },
  { key: "T", label: "Θ. Πλήρης Φοίτηση" },
];

const fixed = (value: number): DdkPointSpec => ({ kind: "fixed", value });
const range = (min: number, max: number): DdkPointSpec => ({ kind: "range", min, max });
const per = (value: number): DdkPointSpec => ({ kind: "per", value });

export const DDK_CATALOG: DdkCategory[] = [
  // ── Α. Γενικές Δραστηριότητες του Σχολείου ──────────────────────────────
  { code: "A1a", section: "A", label: "Εκδόσεις — Εργασία που έχει υποβληθεί για δημοσίευση", hint: "Μόνο για εργασίες που δεν έχουν ξαναπάρει μονάδες.", spec: fixed(1) },
  { code: "A1b", section: "A", label: "Εκδόσεις — Εργασία που έχει δημοσιευθεί στο περιοδικό/εφημερίδα του σχολείου", hint: "Μόνο για εργασίες που δεν έχουν ξαναπάρει μονάδες.", spec: fixed(2) },
  { code: "A2a", section: "A", label: "Μαθητικά Συμβούλια — Συμμετοχή στο Μ.Σ. του τμήματος", spec: range(1, 2) },
  { code: "A2b", section: "A", label: "Μαθητικά Συμβούλια — Συμμετοχή στο Κ.Μ.Σ.", spec: fixed(2) },
  { code: "A2c", section: "A", label: "Μαθητικά Συμβούλια — Συμμετοχή στην Ε.Σ.Ε.Μ./Π.Σ.Ε.Μ.", spec: fixed(1) },
  { code: "A3a", section: "A", label: "Όμιλοι — Συμμετοχή σε Όμιλο", spec: fixed(1) },
  { code: "A3b", section: "A", label: "Όμιλοι — Εργασία στο πλαίσιο Ομίλου", hint: "1 ανά εργασία.", spec: per(1) },
  { code: "A4a", section: "A", label: "Θέατρο — Πρωταγωνιστικός ρόλος", spec: fixed(3) },
  { code: "A4b", section: "A", label: "Θέατρο — Βασικός ρόλος", spec: fixed(2) },
  { code: "A4c", section: "A", label: "Θέατρο — Βοηθητικός ρόλος", spec: fixed(1) },
  { code: "A4d", section: "A", label: "Θέατρο — Σκηνογράφος", spec: range(1, 2) },
  { code: "A5", section: "A", label: "Συμμετοχή στην παρέλαση / Μπάντα", hint: "1 ανά συμμετοχή.", spec: per(1) },
  { code: "A6", section: "A", label: "Εκπροσώπηση του Σχολείου σε Επετειακές εκδηλώσεις / δοξολογίες", hint: "1 ανά συμμετοχή.", spec: per(1) },
  { code: "A7", section: "A", label: "Ερευνητικές εργασίες", spec: range(1, 3) },
  { code: "A8", section: "A", label: "Πολιτιστική δράση στην τοπική και ευρύτερη Κοινότητα", hint: "Συμμετοχή του Σχολείου σε εκδηλώσεις της Κοινότητας. 1 ανά συμμετοχή.", spec: per(1) },
  { code: "A9", section: "A", label: "Άλλες Δράσεις (σχέδια δράσης σχολικής μονάδας, Βουλή των Εφήβων κ.λπ.)", spec: range(1, 3) },

  // ── Β. Προγράμματα ──────────────────────────────────────────────────────
  { code: "B1", section: "B", label: "Ευρωπαϊκά Προγράμματα (Erasmus, e-Twinning κ.λπ.)", spec: range(1, 3) },
  { code: "B2", section: "B", label: "Περιβαλλοντικά Προγράμματα (Globe, SEMEP, Τηγανοκίνηση κ.λπ.)", spec: range(1, 2) },
  { code: "B3", section: "B", label: "Άλλα Προγράμματα (Συνεργασίες μεταξύ σχολείων / Αδελφοποιήσεις κ.λπ.)", spec: range(1, 2) },

  // ── Γ. Σχολικές Εκδηλώσεις ──────────────────────────────────────────────
  { code: "C1a", section: "C", label: "Χορωδία / Ορχήστρα — Συμμετοχή σε 1 εκδήλωση", spec: fixed(1) },
  { code: "C1b", section: "C", label: "Χορωδία / Ορχήστρα — Συμμετοχή σε 2 εκδηλώσεις", spec: fixed(2) },
  { code: "C1c", section: "C", label: "Χορωδία / Ορχήστρα — Συμμετοχή σε περισσότερες από 2 εκδηλώσεις", spec: range(3, 4) },
  { code: "C2", section: "C", label: "Χοροί", hint: "1 ανά συμμετοχή.", spec: per(1) },
  { code: "C3", section: "C", label: "Ομιλίες, Απαγγελίες", hint: "1 ανά συμμετοχή.", spec: per(1) },
  { code: "C4", section: "C", label: "Άλλη συμμετοχή", hint: "1 ανά συμμετοχή.", spec: per(1) },

  // ── Δ. Διαγωνισμοί Εγκεκριμένοι από το ΥΠΠ ───────────────────────────────
  { code: "D1a", section: "D", label: "Συμμετοχή σε διαγωνισμούς — Απλή συμμετοχή", hint: "Δε δίνονται μονάδες για εργασίες που έγιναν μόνο σε ώρα μαθήματος.", spec: fixed(1) },
  { code: "D1b", section: "D", label: "Συμμετοχή σε διαγωνισμούς — Με υποβολή εργασίας", spec: range(1, 3) },
  { code: "D2a", section: "D", label: "Διάκριση — Ενδοσχολικός / Επαρχιακός: Έπαινος / Πρόκριση", spec: fixed(1) },
  { code: "D2b", section: "D", label: "Διάκριση — Ενδοσχολικός / Επαρχιακός: Βραβείο", spec: fixed(2) },
  { code: "D2c", section: "D", label: "Διάκριση — Παγκύπριος: Έπαινος", hint: "+1, ή σύνολο 2 αν δεν προηγήθηκε επαρχιακός.", spec: range(1, 2) },
  { code: "D2d", section: "D", label: "Διάκριση — Παγκύπριος: Βραβείο", hint: "+2, ή σύνολο 3 αν δεν προηγήθηκε επαρχιακός.", spec: range(2, 3) },
  { code: "D2e", section: "D", label: "Διάκριση — Πανελλήνιος / Πανευρωπαϊκός / Διεθνής: Έπαινος", hint: "+1, ή σύνολο 4 αν δεν προηγήθηκε παγκύπριος.", spec: range(1, 4) },
  { code: "D2f", section: "D", label: "Διάκριση — Πανελλήνιος / Πανευρωπαϊκός / Διεθνής: Βραβείο", hint: "+2, ή σύνολο 5 αν δεν προηγήθηκε παγκύπριος.", spec: range(2, 5) },

  // ── Ε. Συνέδρια / Ημερίδες ──────────────────────────────────────────────
  { code: "E1", section: "E", label: "Συμμετοχή σε Συνέδρια / Ημερίδες", hint: "1 ανά συμμετοχή.", spec: per(1) },
  { code: "E2", section: "E", label: "Συμμετοχή σε Συνέδρια / Ημερίδες με υποβολή εργασίας", spec: range(2, 3) },

  // ── Ζ. Αθλητικές Δραστηριότητες ─────────────────────────────────────────
  { code: "Z1a", section: "Z", label: "Συμμετοχή σε Αθλητική ομάδα του σχολείου", spec: fixed(2) },
  { code: "Z1b", section: "Z", label: "Συμμετοχή σε Ημερίδα Στίβου του σχολείου", spec: fixed(1) },
  { code: "Z1c", section: "Z", label: "Συμμετοχή σε αγώνες (ομαδικά ή ατομικά) υπό την αιγίδα του Υ.Π.Π.", hint: "1 ανά άθλημα.", spec: per(1) },
  { code: "Z2a", section: "Z", label: "Διάκριση — Επαρχιακοί αγώνες: Πρόκριση", spec: fixed(1) },
  { code: "Z2b", section: "Z", label: "Διάκριση — Επαρχιακοί αγώνες: Μετάλλιο", hint: "+1.", spec: range(1, 2) },
  { code: "Z2c", section: "Z", label: "Διάκριση — Παγκύπριοι αγώνες: Πρόκριση σε τελικό", hint: "+1, ή σύνολο 2 αν δεν προηγήθηκαν επαρχιακοί.", spec: range(1, 2) },
  { code: "Z2d", section: "Z", label: "Διάκριση — Παγκύπριοι αγώνες: Μετάλλιο", hint: "+2, ή σύνολο 3 αν δεν προηγήθηκαν επαρχιακοί.", spec: range(2, 3) },
  { code: "Z2e", section: "Z", label: "Διάκριση — Πανελλήνιοι / Πανευρωπαϊκοί / Διεθνείς: Διάκριση", hint: "+1, ή σύνολο 4.", spec: range(1, 4) },
  { code: "Z2f", section: "Z", label: "Διάκριση — Πανελλήνιοι / Πανευρωπαϊκοί / Διεθνείς: Μετάλλιο", hint: "+2, ή σύνολο 5.", spec: range(2, 5) },

  // ── Η. Εθελοντισμός / Προσφορά Υπηρεσιών ─────────────────────────────────
  { code: "H1", section: "H", label: "Εθελοντική προσφορά στο σχολείο (μεταφορά καρεκλών, σημαιοστολισμός, κήπος, υπεύθυνος ανακοινώσεων κ.λπ.)", spec: range(1, 3) },
  { code: "H2a", section: "H", label: "Αιμοδοσία — Για κάθε προσφορά αίματος", spec: fixed(2) },
  { code: "H2b", section: "H", label: "Αιμοδοσία — Για κάθε συμμετοχή χωρίς προσφορά", spec: fixed(1) },
  { code: "H3", section: "H", label: "Έρανοι υπό την αιγίδα του ΥΠΠ", hint: "Μόνο για εράνους σε μη διδακτικό χρόνο. 1 ανά συμμετοχή — μέγιστο 5.", spec: per(1) },
  { code: "H4", section: "H", label: "Φιλανθρωπικές δραστηριότητες (κατασκευές, παζαράκια για την Πρόνοια του σχολείου)", hint: "1 ανά συμμετοχή — μέγιστο 5.", spec: per(1) },
  { code: "H5", section: "H", label: "Άλλη προσφορά (εθελοντική εργασία σε κοινωνικές οργανώσεις / ιδρύματα μέσω του σχολείου)", spec: range(1, 2) },

  // ── Θ. Πλήρης Φοίτηση ───────────────────────────────────────────────────
  // Computed automatically from the student's absences (see fullAttendanceAward).
  { code: "T1", section: "T", label: "Πλήρης φοίτηση (λιγότερες από 24 απουσίες στο σύνολο)", spec: fixed(2), autoOnly: true },
];

// Categories a teacher may award by hand (the auto-only ones are excluded).
export const CONVERTIBLE_CATALOG: DdkCategory[] = DDK_CATALOG.filter((c) => !c.autoOnly);

const CATALOG_BY_CODE: Map<string, DdkCategory> = new Map(DDK_CATALOG.map((c) => [c.code, c]));

export function findDdkCategory(code: string): DdkCategory | undefined {
  return CATALOG_BY_CODE.get(code);
}

/** Short human label for a category code (falls back to the raw code). */
export function ddkCategoryLabel(code: string): string {
  return CATALOG_BY_CODE.get(code)?.label ?? code;
}

// Uppercase section headings matching the official printed documents.
export const DDK_SECTION_HEADING: Record<string, string> = {
  A: "Α. ΓΕΝΙΚΕΣ ΔΡΑΣΤΗΡΙΟΤΗΤΕΣ ΤΟΥ ΣΧΟΛΕΙΟΥ",
  B: "Β. ΠΡΟΓΡΑΜΜΑΤΑ ΕΥΡΩΠΑΪΚΑ / ΠΕΡΙΒΑΛΛΟΝΤΙΚΑ / ΑΛΛΑ",
  C: "Γ. ΣΧΟΛΙΚΕΣ ΕΚΔΗΛΩΣΕΙΣ",
  D: "Δ. ΔΙΑΓΩΝΙΣΜΟΙ ΕΓΚΕΚΡΙΜΕΝΟΙ ΑΠΟ ΤΟ ΥΠΠ",
  E: "Ε. ΣΥΝΕΔΡΙΑ / ΗΜΕΡΙΔΕΣ",
  Z: "Ζ. ΑΘΛΗΤΙΚΕΣ ΔΡΑΣΤΗΡΙΟΤΗΤΕΣ",
  H: "Η. ΕΘΕΛΟΝΤΙΣΜΟΣ / ΠΡΟΣΦΟΡΑ ΥΠΗΡΕΣΙΩΝ",
  T: "Θ. ΠΛΗΡΗΣ ΦΟΙΤΗΣΗ",
};

export interface DdkCategoryParts {
  sectionKey: string;
  sectionHeading: string;
  itemNo: number; // numbered item within the section (from the code, e.g. A4a → 4)
  itemLabel: string; // the item title (e.g. "Θέατρο")
  sub: string | null; // the subcategory (e.g. "Πρωταγωνιστικός ρόλος"), if any
}

// The category labels are stored "Item — Subcategory" (or just "Item"); the item
// number lives in the code (e.g. "A4a" → 4). Split them for the report hierarchy.
export function ddkCategoryParts(code: string): DdkCategoryParts {
  const cat = CATALOG_BY_CODE.get(code);
  const sectionKey = cat?.section ?? code.charAt(0);
  const label = cat?.label ?? code;
  const dash = label.indexOf(" — ");
  const itemLabel = dash === -1 ? label : label.slice(0, dash);
  const sub = dash === -1 ? null : label.slice(dash + 3);
  const m = code.match(/^[A-Z](\d+)/);
  return {
    sectionKey,
    sectionHeading: DDK_SECTION_HEADING[sectionKey] ?? sectionKey,
    itemNo: m ? parseInt(m[1]!) : 0,
    itemLabel,
    sub,
  };
}

/** The default points the form pre-fills for a category. */
export function defaultPoints(spec: DdkPointSpec): number {
  return spec.kind === "range" ? spec.min : spec.value;
}

/** Allowed [min, max] bounds for a category's points (used to clamp input).
 *  Only the points the guide mentions are allowed: fixed and per-participation
 *  categories are pinned to their value; ranges allow min..max. */
export function pointsBounds(spec: DdkPointSpec): { min: number; max: number } {
  if (spec.kind === "range") return { min: spec.min, max: spec.max };
  // fixed and per-participation are both pinned to a single value
  return { min: spec.value, max: spec.value };
}

/** Clamp a (possibly user-edited) points value into the category's bounds. */
export function clampPoints(spec: DdkPointSpec, value: number): number {
  const { min, max } = pointsBounds(spec);
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

/** Human label for a point spec, e.g. "1", "1-3", "1 ανά συμμετοχή". */
export function pointSpecLabel(spec: DdkPointSpec): string {
  if (spec.kind === "fixed") return String(spec.value);
  if (spec.kind === "range") return `${spec.min}-${spec.max}`;
  return `${spec.value} ανά συμμετοχή`;
}

const unit = (n: number) => (n === 1 ? "μονάδα" : "μονάδες");

/** Explains how the points are awarded — helps the teacher pick a category. */
export function pointSpecReasoning(spec: DdkPointSpec): string {
  if (spec.kind === "fixed") return `Σταθερές ${spec.value} ${unit(spec.value)}.`;
  if (spec.kind === "per") return `${spec.value} ${unit(spec.value)} για κάθε συμμετοχή.`;
  return `Από ${spec.min} έως ${spec.max} μονάδες, ανάλογα με τη σημασία και την έκταση της συμμετοχής.`;
}

/** Sum of awarded points. */
export function ddkTotal(awards: { points: number }[]): number {
  return awards.reduce((sum, a) => sum + a.points, 0);
}

// The guide's rating scale (Χαρακτηρισμός) for a yearly total.
export function ddkRating(total: number): string {
  if (total <= 0) return "";
  if (total <= 3) return "Μέτρια";
  if (total <= 6) return "Ικανοποιητική";
  if (total <= 9) return "Καλή";
  if (total <= 13) return "Πολύ καλή";
  if (total <= 18) return "Πάρα πολύ καλή";
  return "Εξαιρετική";
}

/** "2025-2026" label from a school-year start year. */
export function schoolYearLabel(startYear: number): string {
  return `${startYear}-${startYear + 1}`;
}

// ── Πλήρης Φοίτηση (full attendance) — computed, never awarded by hand ──────
export const FULL_ATTENDANCE_CODE = "T1";
export const FULL_ATTENDANCE_MAX_ABSENCES = 24; // strictly fewer than this
export const FULL_ATTENDANCE_POINTS = 2;

export interface DerivedAward {
  categoryCode: string;
  points: number;
  note: string;
}

/** The automatic full-attendance award when a student has < 24 absences for
 *  the year, otherwise null. Pure — the absence count is supplied by the caller. */
export function fullAttendanceAward(absences: number): DerivedAward | null {
  if (absences >= FULL_ATTENDANCE_MAX_ABSENCES) return null;
  return {
    categoryCode: FULL_ATTENDANCE_CODE,
    points: FULL_ATTENDANCE_POINTS,
    note: `${absences} ${absences === 1 ? "απουσία" : "απουσίες"}`,
  };
}

export interface DdkSectionSummary {
  section: DdkSection;
  awards: { categoryCode: string; points: number; note?: string | null }[];
  points: number;
}

/** Group awards by section in catalog order, for breakdown views and reports. */
export function summarizeBySection(
  awards: { categoryCode: string; points: number; note?: string | null }[]
): DdkSectionSummary[] {
  return DDK_SECTIONS.map((section) => {
    const sectionAwards = awards.filter(
      (a) => findDdkCategory(a.categoryCode)?.section === section.key
    );
    return { section, awards: sectionAwards, points: ddkTotal(sectionAwards) };
  }).filter((s) => s.awards.length > 0);
}
