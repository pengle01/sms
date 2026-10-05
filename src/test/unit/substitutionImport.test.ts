import { describe, it, expect } from "vitest";
import {
  parseSchoolAbsence,
  resolveImport,
  countByKind,
  normName,
  parsePeriods,
  splitExceptionReason,
  weekdayOf,
  isRealDate,
  readImportMeta,
  type ImportLookups,
  type SchoolAbsenceFile,
  type StaffRef,
} from "@/lib/substitutionImport";
import { SAMPLE, SAMPLE_TEACHERS, sampleLessons } from "../fixtures/schoolAbsenceSample";

/** A timetable that exactly matches the lessons given. */
function lookupsFor(
  lessons: { cls: string; period: number; teacher: string }[],
  teachers: string[],
  opts: { noLogin?: string[]; lastPeriod?: number } = {},
): ImportLookups {
  const groups = new Map<string, string>();
  const slots = new Map<string, { id: string; staffName: string | null }>();
  const staff = new Map<string, StaffRef | "ambiguous">();
  for (const t of teachers) staff.set(normName(t), { id: `s:${t}`, hasLogin: !opts.noLogin?.includes(t) });
  for (const l of lessons) {
    const key = normName(l.cls);
    const gid = groups.get(key) ?? `g:${l.cls}`;
    groups.set(key, gid);
    slots.set(`${gid}:${l.period}`, { id: `slot:${l.cls}:${l.period}`, staffName: l.teacher });
  }
  return { groups, slots, staff, lastPeriod: opts.lastPeriod ?? 7 };
}

const parse = (obj: unknown): SchoolAbsenceFile => {
  const r = parseSchoolAbsence(JSON.stringify(obj));
  if (!r.ok) throw new Error(`fixture did not parse: ${r.error.code}`);
  return r.file;
};
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

describe("parseSchoolAbsence", () => {
  it("accepts the real export's shape", () => {
    expect(parseSchoolAbsence(JSON.stringify(SAMPLE)).ok).toBe(true);
  });

  it("rejects text that isn't JSON", () => {
    expect(parseSchoolAbsence("{not json")).toEqual({ ok: false, error: { code: "badJson" } });
  });

  it("rejects the wrong shape and says where", () => {
    const bad = clone(SAMPLE) as unknown as Record<string, unknown>;
    (bad.sectionA_substitutions as Record<string, unknown>[])[0].period = "one";
    const r = parseSchoolAbsence(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("badShape");
      expect(r.error.params?.path).toBe("sectionA_substitutions.0.period");
    }
  });

  it("rejects a file with no date", () => {
    const { date: _drop, ...rest } = clone(SAMPLE);
    void _drop;
    expect(parseSchoolAbsence(JSON.stringify(rest)).ok).toBe(false);
  });
});

describe("resolveImport — the real sample against a matching timetable", () => {
  const result = resolveImport(parse(SAMPLE), lookupsFor(sampleLessons(), SAMPLE_TEACHERS));
  const at = (cls: string, period: number) =>
    result.entries.filter((e) => e.groupId === `g:${cls}` && e.period === period);

  it("imports cleanly", () => {
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.weekday).toBe(2);
  });

  it("produces 20 covers, 1 swap, 6 support merges and 6 early departures", () => {
    expect(countByKind(result.entries)).toEqual({
      COVER: 20, SWAP: 1, STUDY_HALL: 0, CHAPERONE_HALL: 0, RELEASE: 6, ROOM_CHANGE: 0, SUPPORT_MERGE: 6,
    });
  });

  it("links every entry to its lesson and the absent teacher", () => {
    const ordinary = result.entries.filter((e) => e.kind !== "ROOM_CHANGE");
    expect(ordinary.every((e) => e.timetableSlotId !== null)).toBe(true);
    expect(at("ΘΗΜ3", 2)[0]).toMatchObject({
      kind: "COVER",
      timetableSlotId: "slot:ΘΗΜ3:2",
      absentStaffId: "s:ΗΛ-ΔΕΛΤΑ Δ.",
      substituteStaffId: "s:ΗΛ-ΝΙ Ν.",
      newRoom: "131",
      note: "Μάθημα",
    });
  });

  it("strips the «#» and keeps the comment", () => {
    expect(at("ΘΜΟ3", 1)[0]).toMatchObject({
      kind: "COVER",
      substituteStaffId: "s:Μ-ΛΑΜΔΑ Λ.",
      note: "Αναπλήρωση από κατάλογο μεταγραφών",
    });
  });

  it("turns «Αλλαγή από 7  σε 5» into a swap plus the class leaving early at 7", () => {
    expect(at("ΜΟ1α", 5)[0]).toMatchObject({ kind: "SWAP", substituteStaffId: "s:Β-ΤΑΥ Τ.", newRoom: "49" });
    expect(at("ΜΟ1α", 7)[0]).toMatchObject({
      kind: "RELEASE",
      absentStaffId: "s:Β-ΤΑΥ Τ.",
      timetableSlotId: "slot:ΜΟ1α:7",
    });
  });

  it("does not import the swap a second time from section Γ", () => {
    expect(result.entries.filter((e) => e.kind === "ROOM_CHANGE")).toHaveLength(0);
    expect(at("ΜΟ1α", 5)).toHaveLength(1);
  });

  it("sends support-class students to their class", () => {
    expect(at("ΣΤ_ΜΕ3_ΜΑΘ1", 2)[0]).toMatchObject({ kind: "SUPPORT_MERGE", substituteStaffId: null });
    expect(at("ΕΞΣΤ_ΕΓ1_ΕΛΛ", 6)[0].kind).toBe("SUPPORT_MERGE");
  });

  it("accounts for every class in section Β exactly once", () => {
    const releasedClasses = result.entries.filter((e) => e.kind === "RELEASE").map((e) => e.groupId).sort();
    expect(releasedClasses).toEqual(SAMPLE.sectionB_noSeventhPeriod.classes.map((c) => `g:${c}`).sort());
  });

  it("records the absent teachers with their periods and reasons", () => {
    expect(result.meta.absences).toHaveLength(10);
    const find = (t: string) => result.meta.absences.find((a) => a.teacher === t);
    expect(find("ΗΥ-ΘΗΤΑ Θ.")).toMatchObject({ periods: [6, 7], reason: "Ασθένεια Παιδιού" });
    expect(find("Μ-ΕΨΙΛΟΝ Ε.")).toMatchObject({ periods: [2, 3], reason: "Άλλο" });
    expect(find("Ε-ΒΗΤΑ Β.")).toMatchObject({ periods: [], reason: "Erasmus" });
    expect(result.meta.exemptions).toEqual([]);
  });

  it("keeps the uncovered duty posts and the export time", () => {
    expect(result.meta.duty).toHaveLength(2);
    expect(result.meta.duty[0]).toMatchObject({ teacher: "Γ-ΑΛΦΑ Α.", message: expect.stringContaining("Α/Α 6") });
    expect(result.meta.exportedAt).toBe("2026-09-28T17:49:44.7839713Z");
  });
});

describe("resolveImport — refusals", () => {
  const lessons = sampleLessons();
  const base = () => lookupsFor(lessons, SAMPLE_TEACHERS);

  it("refuses an unknown class, reporting it once however often it appears", () => {
    const l = lookupsFor(lessons.filter((x) => x.cls !== "ΘΗΜ3"), SAMPLE_TEACHERS);
    const r = resolveImport(parse(SAMPLE), l);
    expect(r.errors.filter((e) => e.code === "unknownClass")).toEqual([{ code: "unknownClass", params: { cls: "ΘΗΜ3" } }]);
  });

  it("refuses a lesson the timetable doesn't have", () => {
    const l = lookupsFor(lessons.filter((x) => !(x.cls === "ΘΗΜ3" && x.period === 3)), SAMPLE_TEACHERS);
    expect(resolveImport(parse(SAMPLE), l).errors).toContainEqual({ code: "noLesson", params: { cls: "ΘΗΜ3", period: 3 } });
  });

  it("refuses a lesson taught by someone else, naming both", () => {
    const l = lookupsFor(
      lessons.map((x) => (x.cls === "ΘΗΜ3" && x.period === 2 ? { ...x, teacher: "Ε-ΧΙ Χ." } : x)),
      SAMPLE_TEACHERS,
    );
    expect(resolveImport(parse(SAMPLE), l).errors).toContainEqual({
      code: "teacherMismatch",
      params: { cls: "ΘΗΜ3", period: 2, file: "ΗΛ-ΔΕΛΤΑ Δ.", timetable: "Ε-ΧΙ Χ." },
    });
  });

  it("refuses an unknown substitute", () => {
    const l = lookupsFor(lessons, SAMPLE_TEACHERS.filter((t) => t !== "Μ-ΚΑΠΠΑ Κ."));
    expect(resolveImport(parse(SAMPLE), l).errors).toContainEqual({ code: "unknownTeacher", params: { name: "Μ-ΚΑΠΠΑ Κ." } });
  });

  it("lists every problem in a row at once, not just the first", () => {
    const l = lookupsFor(lessons.filter((x) => x.cls !== "ΘΗΜ3"), SAMPLE_TEACHERS.filter((t) => t !== "ΗΛ-ΝΙ Ν."));
    const codes = resolveImport(parse(SAMPLE), l).errors.map((e) => e.code);
    expect(codes).toContain("unknownClass"); // ΘΗΜ3 is gone …
    expect(codes).toContain("unknownTeacher"); // … and its substitute is still reported
  });

  it("refuses an absent teacher who is only in section Δ and unknown", () => {
    const l = lookupsFor(lessons, SAMPLE_TEACHERS.filter((t) => t !== "ΕΔ-ΙΩΤΑ Ι."));
    expect(resolveImport(parse(SAMPLE), l).errors).toEqual([{ code: "unknownTeacher", params: { name: "ΕΔ-ΙΩΤΑ Ι." } }]);
  });

  it("refuses a name two staff profiles share", () => {
    const l = base();
    (l.staff as Map<string, StaffRef | "ambiguous">).set("Μ-ΚΑΠΠΑ Κ.", "ambiguous");
    expect(resolveImport(parse(SAMPLE), l).errors).toContainEqual({ code: "ambiguousTeacher", params: { name: "Μ-ΚΑΠΠΑ Κ." } });
  });

  it("refuses a day name that doesn't match the date", () => {
    const f = parse({ ...clone(SAMPLE), dayName: "Τετάρτη" });
    expect(resolveImport(f, base()).errors).toContainEqual({ code: "dayMismatch", params: { dayName: "Τετάρτη", date: "2026-09-29" } });
  });

  it("refuses a weekend and an impossible date", () => {
    expect(resolveImport(parse({ ...clone(SAMPLE), date: "2026-09-27", dayName: null }), base()).errors[0].code).toBe("weekend");
    expect(resolveImport(parse({ ...clone(SAMPLE), date: "2026-02-30", dayName: null }), base()).errors[0].code).toBe("badDate");
  });
});

describe("resolveImport — other cases", () => {
  it("warns, without refusing, when a substitute has no login", () => {
    const r = resolveImport(parse(SAMPLE), lookupsFor(sampleLessons(), SAMPLE_TEACHERS, { noLogin: ["Μ-ΚΑΠΠΑ Κ."] }));
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([{ code: "noLogin", params: { name: "Μ-ΚΑΠΠΑ Κ." } }]);
  });

  it("imports a real room change for the teacher without marking them absent", () => {
    const f = clone(SAMPLE);
    f.sectionC_roomChanges.push({ id: 1, class: "ΘΗΜ3", period: 2, comments: null, teacher: "ΗΛ-ΔΕΛΤΑ Δ.", newRoom: "Β61" });
    const r = resolveImport(parse(f), lookupsFor(sampleLessons(), SAMPLE_TEACHERS));
    expect(r.errors).toEqual([]);
    expect(r.entries.find((e) => e.kind === "ROOM_CHANGE")).toMatchObject({
      substituteStaffId: "s:ΗΛ-ΔΕΛΤΑ Δ.",
      absentStaffId: null,
      timetableSlotId: null,
      newRoom: "Β61",
    });
  });

  it("releases a section-Β class at the day's last period when nothing else explains it", () => {
    const f = clone(SAMPLE);
    f.sectionB_noSeventhPeriod.classes.push("ΘΗΜ3");
    const lessons = [...sampleLessons(), { cls: "ΘΗΜ3", period: 7, teacher: "Ε-ΧΙ Χ." }];
    const r = resolveImport(parse(f), lookupsFor(lessons, SAMPLE_TEACHERS));
    expect(r.errors).toEqual([]);
    expect(r.entries.find((e) => e.groupId === "g:ΘΗΜ3" && e.kind === "RELEASE")).toMatchObject({
      period: 7,
      absentStaffId: null,
      timetableSlotId: "slot:ΘΗΜ3:7",
    });
  });

  it("turns «Φ/δι εφημ ΒΔ» into a study hall in the kiosks", () => {
    const f = clone(SAMPLE);
    f.sectionA_substitutions[4] = { ...f.sectionA_substitutions[4], substituteTeacher: "Φ/δι εφημ ΒΔ", newRoom: null };
    const r = resolveImport(parse(f), lookupsFor(sampleLessons(), SAMPLE_TEACHERS));
    expect(r.entries.find((e) => e.kind === "STUDY_HALL")).toMatchObject({ groupId: "g:ΘΗΜ3", newRoom: "κιόσκια" });
  });

  it("turns «Φ/δι Συνοδοί» into a chaperones' study hall, not the deputy's", () => {
    const f = clone(SAMPLE);
    f.sectionA_substitutions[4] = { ...f.sectionA_substitutions[4], substituteTeacher: "Φ/δι Συνοδοί", newRoom: null };
    const r = resolveImport(parse(f), lookupsFor(sampleLessons(), SAMPLE_TEACHERS));
    expect(r.entries.find((e) => e.kind === "CHAPERONE_HALL")).toMatchObject({ groupId: "g:ΘΗΜ3", newRoom: null, substituteStaffId: null });
    expect(r.entries.some((e) => e.kind === "STUDY_HALL")).toBe(false);
  });

  it("lists a teacher who is only in section Ε as an exemption", () => {
    const f = clone(SAMPLE);
    f.sectionE_exceptions.push({ teacher: "Φ-ΦΙ Φ.", reason: "3  Σεμινάριο" });
    const r = resolveImport(parse(f), lookupsFor(sampleLessons(), SAMPLE_TEACHERS));
    expect(r.meta.exemptions).toEqual([{ teacher: "Φ-ΦΙ Φ.", staffId: "s:Φ-ΦΙ Φ.", periods: [3], reason: "Σεμινάριο" }]);
  });

  it("matches a name typed with a decomposed «Ϊ» and stray spaces", () => {
    const f = clone(SAMPLE);
    f.sectionA_substitutions[15] = {
      ...f.sectionA_substitutions[15],
      substituteTeacher: "#Ε-ΣΙΓΜΑΪΔΟΥ  Σ. ",
    };
    const r = resolveImport(parse(f), lookupsFor(sampleLessons(), SAMPLE_TEACHERS));
    expect(r.errors).toEqual([]);
  });
});

describe("helpers", () => {
  it("parsePeriods", () => {
    expect(parsePeriods("6,7")).toEqual([6, 7]);
    expect(parsePeriods(" 2 , 3 ")).toEqual([2, 3]);
    expect(parsePeriods("")).toEqual([]);
    expect(parsePeriods(null)).toEqual([]);
  });

  it("splitExceptionReason", () => {
    expect(splitExceptionReason("6,7  Ασθένεια Παιδιού")).toEqual({ periods: [6, 7], reason: "Ασθένεια Παιδιού" });
    expect(splitExceptionReason("  Erasmus")).toEqual({ periods: [], reason: "Erasmus" });
    expect(splitExceptionReason(null)).toEqual({ periods: [], reason: "" });
  });

  it("weekdayOf / isRealDate", () => {
    expect(weekdayOf("2026-09-29")).toBe(2);
    expect(weekdayOf("2026-09-27")).toBeNull();
    expect(isRealDate("2026-02-30")).toBe(false);
    expect(weekdayOf("2026-02-30")).toBeNull();
  });

  it("readImportMeta tolerates anything malformed", () => {
    expect(readImportMeta(null)).toBeNull();
    expect(readImportMeta({ absences: "x" })).toEqual({ exportedAt: null, absences: [], exemptions: [], duty: [] });
  });
});
