// «Πρόγραμμα επισκέψεων γονέων»: reading the school's Excel sheet, matching its
// names to the timetable's codings, and who appears on which list. Pure; tested.
// The sheet names teachers in full («ΑΡΝΟΣ ΣΩΚΡΑΤΗΣ») and the timetable by coding
// («Μ-ΑΡΝΟΣ Σ.»), so only an unambiguous match is automatic.

import { parseSupportGroup } from "@/lib/specialEd";

export interface VisitEntry {
  /** Identifies this row across uploads: name and department. */
  key: string;
  fileName: string;
  surname: string;
  firstName: string;
  section: string;
  slotText: string;
  dayOfWeek: number | null;
  period: number | null;
  startTime: string | null;
  endTime: string | null;
  byAppointment: boolean;
  /** Only a headteacher's (ΒΔ / ΒΔΑ); every other number is dropped on reading. */
  phone: string | null;
}

const DAYS: Record<string, number> = { ΔΕΥΤΕΡΑ: 1, ΤΡΙΤΗ: 2, ΤΕΤΑΡΤΗ: 3, ΠΕΜΠΤΗ: 4, ΠΑΡΑΣΚΕΥΗ: 5 };

/** Upper case, no accents. */
function plain(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .trim();
}

export function parseVisitSlot(text: unknown): Pick<
  VisitEntry,
  "dayOfWeek" | "period" | "startTime" | "endTime" | "byAppointment"
> | null {
  const t = plain(text);
  if (t.includes("ΡΑΝΤΕΒΟΥ")) {
    return { dayOfWeek: null, period: null, startTime: null, endTime: null, byAppointment: true };
  }
  const m = t.match(/^(\S+)\s+(\d+)Η\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
  const day = m ? DAYS[m[1]!] : undefined;
  if (!m || !day) return null;
  return { dayOfWeek: day, period: Number(m[2]), startTime: m[3]!, endTime: m[4]!, byAppointment: false };
}

/**
 * The sheet's rows into one entry per teacher and slot. Rows before the first
 * department heading (management) hold «full name, specialty, slot, …, phone»;
 * rows under a heading hold «surname, first name, slot». A row with text in the
 * slot column that can't be read is reported, not guessed.
 */
export function parseVisitSchedule(rows: readonly (readonly unknown[])[]): {
  entries: VisitEntry[];
  unreadable: string[];
} {
  const header = rows.findIndex((r) => plain(r[0]).includes("ΟΝΟΜΑΤΕΠΩΝΥΜΟ"));
  const entries: VisitEntry[] = [];
  const unreadable: string[] = [];
  if (header < 0) return { entries, unreadable };

  const seen = new Set<string>();
  let section = "";
  for (const r of rows.slice(header + 1)) {
    const first = typeof r[0] === "string" ? r[0].trim() : "";
    if (/^ΑΠΟ\s+ΤΗ\s+ΔΙΕΥΘΥΝΣΗ/.test(plain(first))) break;
    const slotCell = String(r[2] ?? "").trim();
    if (!slotCell) {
      if (first) section = first.replace(/\s*ΤΗΛ.*$/i, "").trim();
      continue;
    }
    const slot = parseVisitSlot(slotCell);
    const name = section ? `${first} ${String(r[1] ?? "").trim()}`.trim() : first;
    if (!slot || !name) {
      unreadable.push(`${name || "—"}: ${slotCell}`);
      continue;
    }
    const [surname = "", ...rest] = plain(name).split(/\s+/);
    const isHeadteacher = !section && /^ΒΔ/.test(plain(r[1]));
    const phone = isHeadteacher ? String(r[5] ?? "").trim() : "";
    const once = `${plain(name)}|${plain(slotCell)}`;
    if (seen.has(once)) continue;
    seen.add(once);
    entries.push({
      key: `${plain(name)}|${plain(section)}`,
      fileName: name,
      surname,
      firstName: rest.join(" "),
      section,
      slotText: slotCell,
      ...slot,
      phone: phone || null,
    });
  }
  return { entries, unreadable };
}

// Latin letters typed for their Greek look-alikes in the timetable's codings.
const LOOKALIKE: Record<string, string> = {
  A: "Α", B: "Β", E: "Ε", H: "Η", I: "Ι", K: "Κ", M: "Μ", N: "Ν", O: "Ο", P: "Ρ", T: "Τ", X: "Χ", Y: "Υ", Z: "Ζ",
};

/** For comparing names: no accents, Greek letters, no doubled letters. */
export function foldName(s: unknown): string {
  return plain(s)
    .replace(/[A-Z]/g, (c) => LOOKALIKE[c] ?? c)
    .replace(/(.)\1+/g, "$1");
}

/** «Μ-ΚΑΣΚΙΡΗΣ Χ. ΒΔ» → subject Μ, surname, initial Χ. Null when it isn't a coding. */
export function parseStaffCode(code: string): { subject: string; surname: string; initial: string } | null {
  const m = code.trim().match(/^([^-\s]+)-(\S+)(?:\s+(\S+))?/);
  if (!m) return null;
  const initial = foldName((m[3] ?? "").replace(/\./g, ""));
  return {
    subject: foldName(m[1]),
    surname: foldName(m[2]),
    initial: /^(ΒΔΑ?|Δ)$/.test(initial) && !m[3]?.includes(".") ? "" : initial,
  };
}

// Department headings whose subject code is known; only used to split ties.
const SECTION_SUBJECT: Record<string, string> = {
  ΘΡΗΣΚΕΥΤΙΚΑ: "Θ",
  ΦΙΛΟΛΟΓΟΙ: "Ε",
  ΜΑΘΗΜΑΤΙΚΑ: "Μ",
  ΦΥΣΙΚΗΣ: "Φ",
  ΧΗΜΕΙΑΣ: "Χ",
  ΑΓΓΛΙΚΩΝ: "Α",
  ΓΑΛΛΙΚΩΝ: "Γ",
  ΗΛΕΚΤΡΟΛΟΓΙΑ: "ΗΛ",
  "ΜΗΧΑΝΙΚΗΣ Η.Υ.": "ΗΥ",
  ΞΕΝΟΔΟΧΕΙΑΚΑ: "Ξ",
};

/**
 * Each entry's staff record, or null where someone must choose. A saved choice
 * wins; otherwise surname and initial must point at exactly one record, and no
 * two different people in the sheet may land on the same one.
 */
export function matchVisitEntries(
  entries: readonly VisitEntry[],
  staff: readonly { id: string; scheduleName: string | null }[],
  saved: ReadonlyMap<string, string> = new Map(),
): Map<string, string | null> {
  const codes = staff.flatMap((s) => {
    const code = s.scheduleName ? parseStaffCode(s.scheduleName) : null;
    return code ? [{ id: s.id, ...code }] : [];
  });
  const known = new Set(staff.map((s) => s.id));
  const guess = (e: VisitEntry): string | null => {
    const surname = foldName(e.surname);
    const first = foldName(e.firstName);
    let hits = codes.filter((c) => c.surname === surname && (!c.initial || first.startsWith(c.initial)));
    if (hits.length > 1) {
      const subject = SECTION_SUBJECT[plain(e.section)];
      if (subject) hits = hits.filter((c) => c.subject === subject);
    }
    return hits.length === 1 ? hits[0]!.id : null;
  };

  const result = new Map<string, string | null>();
  const namesPerRecord = new Map<string, Set<string>>();
  for (const e of entries) {
    const choice = saved.get(e.key);
    if (choice && known.has(choice)) {
      result.set(e.key, choice);
      continue;
    }
    const id = guess(e);
    result.set(e.key, id);
    if (id) namesPerRecord.set(id, (namesPerRecord.get(id) ?? new Set()).add(foldName(e.fileName)));
  }
  for (const [key, id] of result) {
    if (id && (namesPerRecord.get(id)?.size ?? 0) > 1) result.set(key, null);
  }
  return result;
}

/**
 * The groups behind a homegroup's list: the homegroup and the subject groups its
 * students attend — never a support group, whose name would reveal that the class
 * has special-education students.
 */
export function homegroupListGroupIds(
  homegroupId: string,
  subjectGroups: readonly { id: string; name: string }[],
): string[] {
  return [
    ...new Set([homegroupId, ...subjectGroups.filter((g) => !parseSupportGroup(g.name)).map((g) => g.id)]),
  ];
}

export interface VisitListRow {
  staffProfileId: string | null;
  name: string;
  department: string | null;
  /** «Μαθηματικά», and the group's name when it isn't the homegroup. */
  lessons: { course: string; group: string | null }[];
  roles: ("teacher" | "head" | "counselor")[];
  hours: { slotText: string; dayOfWeek: number | null; period: number | null; startTime: string | null; endTime: string | null; byAppointment: boolean; phone: string | null }[];
}

/** One row per teacher, with each lesson once, sorted by name. */
export function buildVisitRows(input: {
  homegroupId: string | null;
  showGroupNames: boolean;
  slots: readonly { staffName: string | null; groupId: string; groupName: string; courseName: string }[];
  homeroom: readonly { staffProfileId: string; role: "teacher" | "head" | "counselor" }[];
  profiles: readonly { id: string; scheduleName: string | null; department: string | null }[];
  hours: readonly (VisitListRow["hours"][number] & { staffProfileId: string | null })[];
}): VisitListRow[] {
  const byName = new Map(input.profiles.flatMap((p) => (p.scheduleName ? [[p.scheduleName.trim(), p] as const] : [])));
  const byId = new Map(input.profiles.map((p) => [p.id, p]));
  const rows = new Map<string, VisitListRow>();
  const rowFor = (key: string, name: string, profile: (typeof input.profiles)[number] | undefined) => {
    let row = rows.get(key);
    if (!row) {
      row = {
        staffProfileId: profile?.id ?? null,
        name,
        department: profile?.department ?? null,
        lessons: [],
        roles: [],
        hours: input.hours.filter((h) => profile && h.staffProfileId === profile.id),
      };
      rows.set(key, row);
    }
    return row;
  };
  for (const s of input.slots) {
    const name = s.staffName?.trim();
    if (!name) continue;
    const profile = byName.get(name);
    const row = rowFor(profile?.id ?? name, name, profile);
    const group = input.showGroupNames && s.groupId !== input.homegroupId ? s.groupName : null;
    if (!row.lessons.some((l) => l.course === s.courseName && l.group === group)) {
      row.lessons.push({ course: s.courseName, group });
    }
  }
  for (const h of input.homeroom) {
    const profile = byId.get(h.staffProfileId);
    if (!profile) continue;
    const row = rowFor(profile.id, profile.scheduleName?.trim() ?? "—", profile);
    if (!row.roles.includes(h.role)) row.roles.push(h.role);
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name, "el"));
}
