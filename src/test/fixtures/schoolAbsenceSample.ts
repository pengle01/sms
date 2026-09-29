// A real SchoolAbsence export (2026-09-29, Tuesday) with every TEACHER NAME
// REPLACED by an invented code — the original pairs real names with health
// reasons («Ασθένεια», «Ασθένεια Παιδιού»), which must not be committed.
// Structure, classes, periods, rooms, comments and every quirk are kept exactly:
// «#» prefixes, the two-space «Αλλαγή από 7  σε 5», the trailing space in
// «…το τμήμα », section-C duplicate of the swap, «6,7» partial absences,
// «  Άλλο» reasons with the leading spaces, a Ϊ that needs NFC matching.
type Row = {
  id: number; class: string; teacher: string; period: number;
  substituteTeacher: string | null; comments: string | null; room: string | null; newRoom: string | null;
};
type RoomChange = { id: number; class: string; period: number; comments: string | null; teacher: string; newRoom: string | null };
type TeacherReason = { teacher: string; reason: string };

/** The file as SchoolAbsence writes it (before parsing), loosely typed so tests can alter it. */
export interface SampleFile {
  date: string;
  dayName: string | null;
  exportedAt: string;
  source: string;
  sectionA_substitutions: Row[];
  sectionB_noSeventhPeriod: { title: string; classes: string[] };
  sectionC_roomChanges: RoomChange[];
  sectionD_absentTeachers: TeacherReason[];
  sectionF_dutyAndAbsence: { id: number; teacher: string; message: string }[];
  sectionE_exceptions: TeacherReason[];
}

export const SAMPLE: SampleFile = {
  date: "2026-09-29",
  dayName: "Τρίτη",
  exportedAt: "2026-09-28T17:49:44.7839713Z",
  source: "SchoolAbsence",
  sectionA_substitutions: [
    { id: 12637, class: "ΓΑΛ_ΘΗΥ1_ΘΗΜ1_1", teacher: "Γ-ΑΛΦΑ Α.", period: 1, substituteTeacher: "Μ-ΚΑΠΠΑ Κ.", comments: "Προκαθορισμένη αναπλήρωση", room: "25", newRoom: "25" },
    { id: 12663, class: "ΣΤ_ΘΗΥ1_ΘΗΜ1_ΕΛΛ", teacher: "Ε-ΒΗΤΑ Β.", period: 1, substituteTeacher: "Να πάνε στην τάξη που έχει μάθημα το τμήμα ", comments: null, room: "129α", newRoom: null },
    { id: 12654, class: "ΘΜΟ3", teacher: "Τ-ΓΑΜΜΑ Γ.", period: 1, substituteTeacher: "#Μ-ΛΑΜΔΑ Λ.", comments: "Αναπλήρωση από κατάλογο μεταγραφών", room: "121", newRoom: "121" },
    { id: 12636, class: "ΓΑΛ_ΗΕ3_ΜΠ3_2", teacher: "Γ-ΑΛΦΑ Α.", period: 2, substituteTeacher: "#Μ-ΜΙ Μ.", comments: "Αναπλήρωση από κατάλογο μεταγραφών", room: "12", newRoom: "12" },
    { id: 12646, class: "ΘΗΜ3", teacher: "ΗΛ-ΔΕΛΤΑ Δ.", period: 2, substituteTeacher: "ΗΛ-ΝΙ Ν.", comments: "Μάθημα", room: "131", newRoom: "131" },
    { id: 12664, class: "ΣΤ_ΜΕ3_ΜΑΘ1", teacher: "Μ-ΕΨΙΛΟΝ Ε.", period: 2, substituteTeacher: "Να πάνε στην τάξη που έχει μάθημα το τμήμα ", comments: null, room: "119", newRoom: null },
    { id: 12634, class: "ΑΣΤ_ΜΠ3_ΓΧ_ΣΤΜΗΧ", teacher: "Τ-ΓΑΜΜΑ Γ.", period: 2, substituteTeacher: "Να πάνε στην τάξη που έχει μάθημα το τμήμα ", comments: null, room: "120", newRoom: null },
    { id: 12638, class: "ΓΑΛ_ΘΗΥ3_2", teacher: "Γ-ΑΛΦΑ Α.", period: 3, substituteTeacher: "#Α-ΞΙ Ξ.", comments: "Αναπλήρωση από κατάλογο μεταγραφών", room: "138", newRoom: "138" },
    { id: 12633, class: "ΑΣΤ_ΙΑ_ΘΗΨ3β_ΕΛΛ2", teacher: "Ε-ΖΗΤΑ Ζ. ΒΔ", period: 3, substituteTeacher: "Να πάνε στην τάξη που έχει μάθημα το τμήμα ", comments: null, room: "37", newRoom: null },
    { id: 12647, class: "ΘΗΜ3", teacher: "ΗΛ-ΔΕΛΤΑ Δ.", period: 3, substituteTeacher: "ΗΛ-ΝΙ Ν.", comments: "Μάθημα", room: "131", newRoom: "131" },
    { id: 12662, class: "ΣΤ_ΗΕ2_ΜΠ2_ΜΑΘ3(3)", teacher: "Μ-ΕΨΙΛΟΝ Ε.", period: 3, substituteTeacher: "Να πάνε στην τάξη που έχει μάθημα το τμήμα ", comments: null, room: "132", newRoom: null },
    { id: 12650, class: "ΘΗΨ3β", teacher: "Ε-ΖΗΤΑ Ζ. ΒΔ", period: 4, substituteTeacher: "Μ-ΟΜΙΚΡΟΝ Ο.", comments: "Μάθημα", room: "24", newRoom: "24" },
    { id: 12644, class: "ΘΗΜ1_ΘΗΥ1", teacher: "Ε-ΒΗΤΑ Β.", period: 4, substituteTeacher: "#Α-ΠΙ Π.", comments: "Αναπλήρωση από κατάλογο μεταγραφών", room: "37", newRoom: "37" },
    { id: 12655, class: "ΜΟ1α", teacher: "ΗΥ-ΗΤΑ Η. ΒΔ", period: 4, substituteTeacher: "#Φ-ΡΟ Ρ.", comments: "Αναπλήρωση από κατάλογο μεταγραφών", room: "113", newRoom: "113" },
    { id: 12651, class: "ΘΗΨ3β", teacher: "Ε-ΖΗΤΑ Ζ. ΒΔ", period: 5, substituteTeacher: "Μ-ΟΜΙΚΡΟΝ Ο.", comments: "Μάθημα", room: "24", newRoom: "24" },
    { id: 12645, class: "ΘΗΜ1_ΘΗΥ1", teacher: "Ε-ΒΗΤΑ Β.", period: 5, substituteTeacher: "#Ε-ΣΙΓΜΑΪΔΟΥ Σ.", comments: "Αναπλήρωση από κατάλογο μεταγραφών", room: "37", newRoom: "37" },
    { id: 12656, class: "ΜΟ1α", teacher: "ΗΥ-ΗΤΑ Η. ΒΔ", period: 5, substituteTeacher: "Β-ΤΑΥ Τ.", comments: "Αλλαγή από 7  σε 5", room: "113", newRoom: "49" },
    { id: 12652, class: "ΘΜΓ2", teacher: "Τ-ΓΑΜΜΑ Γ.", period: 5, substituteTeacher: "ΗΥ-ΥΨΙΛΟΝ Υ.", comments: null, room: "121", newRoom: "121" },
    { id: 12659, class: "ΜΠ2", teacher: "Τ-Χ2(Δοκιμ)", period: 5, substituteTeacher: "Φ-ΦΙ Φ.", comments: null, room: "132", newRoom: "132" },
    { id: 12635, class: "ΓΑΛ_ΕΓ1_2", teacher: "Γ-ΑΛΦΑ Α.", period: 6, substituteTeacher: "Ε-ΧΙ Χ.", comments: null, room: "129", newRoom: "129" },
    { id: 12640, class: "ΕΞΣΤ_ΕΓ1_ΕΛΛ", teacher: "Ε-ΒΗΤΑ Β.", period: 6, substituteTeacher: "Να πάνε στην τάξη που έχει μάθημα το τμήμα ", comments: null, room: "37", newRoom: null },
    { id: 12641, class: "ΗΥ2", teacher: "ΗΛ-ΔΕΛΤΑ Δ.", period: 6, substituteTeacher: "ΗΛ-ΨΙ Ψ.", comments: "Μάθημα", room: "131", newRoom: "131" },
    { id: 12657, class: "ΜΟ1β", teacher: "ΗΥ-ΗΤΑ Η. ΒΔ", period: 6, substituteTeacher: "Φ-ΩΜΕΓΑ Ω.", comments: null, room: "113", newRoom: "113" },
    { id: 12648, class: "ΘΗΥ1", teacher: "ΗΥ-ΘΗΤΑ Θ.", period: 6, substituteTeacher: "Φ-ΑΣΤΕΡΙ Α.", comments: null, room: "117", newRoom: "117" },
    { id: 12653, class: "ΘΜΓ2", teacher: "Τ-ΓΑΜΜΑ Γ.", period: 6, substituteTeacher: "Φ-ΒΡΟΧΗ Β.", comments: null, room: "121", newRoom: "121" },
    { id: 12660, class: "ΜΠ2", teacher: "Τ-Χ2(Δοκιμ)", period: 6, substituteTeacher: "ΕΓ-ΓΕΦΥΡΑ Γ.", comments: null, room: "132", newRoom: "132" },
    { id: 12639, class: "ΓΑΛ_ΘΜΓ2_ΘΜΟ2_2", teacher: "Γ-ΑΛΦΑ Α.", period: 7, substituteTeacher: null, comments: null, room: "24", newRoom: null },
    { id: 12643, class: "ΘΔΜ3β", teacher: "Ε-ΖΗΤΑ Ζ. ΒΔ", period: 7, substituteTeacher: null, comments: null, room: "119", newRoom: null },
    { id: 12642, class: "ΗΥ2", teacher: "ΗΛ-ΔΕΛΤΑ Δ.", period: 7, substituteTeacher: "ΗΛ-ΨΙ Ψ.", comments: "Μάθημα", room: "131", newRoom: "131" },
    { id: 12658, class: "ΜΟ1β", teacher: "ΗΥ-ΗΤΑ Η. ΒΔ", period: 7, substituteTeacher: null, comments: null, room: "113", newRoom: null },
    { id: 12649, class: "ΘΗΥ1", teacher: "ΗΥ-ΘΗΤΑ Θ.", period: 7, substituteTeacher: null, comments: null, room: "117", newRoom: null },
    { id: 12661, class: "ΜΠ2", teacher: "Τ-Χ2(Δοκιμ)", period: 7, substituteTeacher: null, comments: null, room: "132", newRoom: null },
  ],
  sectionB_noSeventhPeriod: {
    title: "Τμήματα που δεν θα παρακολουθήσουν 7η/8η περίοδο",
    classes: ["ΜΟ1α", "ΓΑΛ_ΘΜΓ2_ΘΜΟ2_2", "ΘΔΜ3β", "ΘΗΥ1", "ΜΟ1β", "ΜΠ2"],
  },
  sectionC_roomChanges: [
    { id: 12665, class: "ΜΟ1α", period: 5, comments: "Αλλαγή από 7  σε 5", teacher: "Β-ΤΑΥ Τ.", newRoom: "49" },
  ],
  sectionD_absentTeachers: [
    { teacher: "Γ-ΑΛΦΑ Α.", reason: "" },
    { teacher: "Ε-ΖΗΤΑ Ζ. ΒΔ", reason: "" },
    { teacher: "Ε-ΒΗΤΑ Β.", reason: "" },
    { teacher: "ΕΔ-ΙΩΤΑ Ι.", reason: "" },
    { teacher: "ΗΛ-ΔΕΛΤΑ Δ.", reason: "" },
    { teacher: "ΗΥ-ΗΤΑ Η. ΒΔ", reason: "" },
    { teacher: "ΗΥ-ΘΗΤΑ Θ.", reason: "6,7" },
    { teacher: "Μ-ΕΨΙΛΟΝ Ε.", reason: "2,3" },
    { teacher: "Τ-ΓΑΜΜΑ Γ.", reason: "" },
    { teacher: "Τ-Χ2(Δοκιμ)", reason: "" },
  ],
  sectionF_dutyAndAbsence: [
    { id: 12692, teacher: "Γ-ΑΛΦΑ Α.", message: "Εφημερία: Πέταλο Παγκάκια με Δένδρα (Α/Α 6) — απουσιάζει" },
    { id: 12693, teacher: "Τ-ΓΑΜΜΑ Γ.", message: "Εφημερία: Παράθυρα Καντίνας –  Χώρος Συγκεντρώσεων (Α/Α 7 – 8) — απουσιάζει" },
  ],
  sectionE_exceptions: [
    { teacher: "Γ-ΑΛΦΑ Α.", reason: "  Άλλο" },
    { teacher: "Ε-ΖΗΤΑ Ζ. ΒΔ", reason: "  Άλλο" },
    { teacher: "Ε-ΒΗΤΑ Β.", reason: "  Erasmus" },
    { teacher: "ΕΔ-ΙΩΤΑ Ι.", reason: "  Ασθένεια" },
    { teacher: "ΗΛ-ΔΕΛΤΑ Δ.", reason: "  Ασθένεια" },
    { teacher: "ΗΥ-ΗΤΑ Η. ΒΔ", reason: "  Άλλο" },
    { teacher: "ΗΥ-ΘΗΤΑ Θ.", reason: "6,7  Ασθένεια Παιδιού" },
    { teacher: "Μ-ΕΨΙΛΟΝ Ε.", reason: "2,3  Άλλο" },
    { teacher: "Τ-ΓΑΜΜΑ Γ.", reason: "  Ασθένεια" },
    { teacher: "Τ-Χ2(Δοκιμ)", reason: "  Άλλο" },
  ],
};

/** Every teacher code in the sample. */
export const SAMPLE_TEACHERS = [
  "Γ-ΑΛΦΑ Α.", "Ε-ΒΗΤΑ Β.", "Τ-ΓΑΜΜΑ Γ.", "ΗΛ-ΔΕΛΤΑ Δ.", "Μ-ΕΨΙΛΟΝ Ε.", "Ε-ΖΗΤΑ Ζ. ΒΔ", "ΗΥ-ΗΤΑ Η. ΒΔ",
  "Τ-Χ2(Δοκιμ)", "ΗΥ-ΘΗΤΑ Θ.", "ΕΔ-ΙΩΤΑ Ι.", "Μ-ΚΑΠΠΑ Κ.", "Μ-ΛΑΜΔΑ Λ.", "Μ-ΜΙ Μ.", "ΗΛ-ΝΙ Ν.", "Α-ΞΙ Ξ.",
  "Μ-ΟΜΙΚΡΟΝ Ο.", "Α-ΠΙ Π.", "Φ-ΡΟ Ρ.", "Ε-ΣΙΓΜΑΪΔΟΥ Σ.", "Β-ΤΑΥ Τ.", "ΗΥ-ΥΨΙΛΟΝ Υ.", "Φ-ΦΙ Φ.", "Ε-ΧΙ Χ.",
  "ΗΛ-ΨΙ Ψ.", "Φ-ΩΜΕΓΑ Ω.", "Φ-ΑΣΤΕΡΙ Α.", "Φ-ΒΡΟΧΗ Β.", "ΕΓ-ΓΕΦΥΡΑ Γ.",
];

/**
 * The Tuesday lessons the sample implies: each section-A row is a lesson of
 * its class at its period, taught by the absent teacher; plus the swap source
 * (ΜΟ1α at period 7, taught by the teacher moved to period 5).
 */
export function sampleLessons(): { cls: string; period: number; teacher: string }[] {
  const rows = SAMPLE.sectionA_substitutions.map((r) => ({ cls: r.class, period: r.period, teacher: r.teacher }));
  rows.push({ cls: "ΜΟ1α", period: 7, teacher: "Β-ΤΑΥ Τ." });
  return rows;
}
