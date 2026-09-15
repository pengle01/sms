import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { parseSupportGroup, SPECIAL_ED_ACCOMMODATIONS, SPECIAL_ED_PROBLEM_CODES, type SupportKind } from "@/lib/specialEd";

/**
 * The prefixes that mark a timetable group as support, as a Prisma filter.
 *
 * One definition. parseSupportGroup() in @/lib/specialEd is the pure classifier
 * and owns the same two prefixes; keeping the query's copy here rather than
 * inlining it at each call site means a third reader cannot quietly disagree
 * about what a support group is — which is exactly what happened to the
 * substitutions engine.
 */
export const SUPPORT_GROUP_WHERE: Prisma.StudentGroupWhereInput = {
  OR: [{ group: { name: { startsWith: "ΣΤ_" } } }, { group: { name: { startsWith: "ΑΣΤ_" } } }],
};

export type SupportEntry = {
  kind: SupportKind;
  groupName: string;
  subject: string; // Course.nameEl
  teacher: string | null; // schedule coding
  period: number;
  dayOfWeek: number;
  room: string | null;
};

/**
 * Derives a student's support (ΣΤΗΡ) from the timetable — never stored. Reads the
 * student's enrolment in ΣΤ_ (group) / ΑΣΤ_ (atomic) support groups and expands
 * each into its timetable slots.
 */
export async function getStudentSupport(studentId: string): Promise<SupportEntry[]> {
  const enrolments = await db.studentGroup.findMany({
    where: { studentProfileId: studentId, ...SUPPORT_GROUP_WHERE },
    select: {
      group: {
        select: {
          name: true,
          timetableSlots: {
            select: {
              period: true,
              dayOfWeek: true,
              room: true,
              course: { select: { nameEl: true, name: true } },
              staff: { select: { scheduleName: true } },
              staffName: true,
            },
          },
        },
      },
    },
  });

  const out: SupportEntry[] = [];
  for (const e of enrolments) {
    const parsed = parseSupportGroup(e.group.name);
    if (!parsed) continue;
    for (const s of e.group.timetableSlots) {
      out.push({
        kind: parsed.kind,
        groupName: e.group.name,
        subject: s.course.nameEl || s.course.name,
        teacher: s.staff?.scheduleName ?? s.staffName ?? null,
        period: s.period,
        dayOfWeek: s.dayOfWeek,
        room: s.room ?? null,
      });
    }
  }

  out.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.period - b.period);
  return out;
}

/**
 * True when the given staff member teaches the student — i.e. has a timetable
 * slot in any group the student belongs to (homeroom, subject, or support).
 * Gates the codes-only intentional reveal for ordinary teachers.
 */
export async function teachesStudent(staffId: string, studentId: string): Promise<boolean> {
  const student = await db.studentProfile.findUnique({
    where: { id: studentId },
    select: { groupId: true, subjectGroups: { select: { groupId: true } } },
  });
  if (!student) return false;

  const groupIds = [student.groupId, ...student.subjectGroups.map((g) => g.groupId)].filter(
    (g): g is string => !!g,
  );
  if (groupIds.length === 0) return false;

  const slot = await db.timetableSlot.findFirst({
    where: { staffId, groupId: { in: groupIds } },
    select: { id: true },
  });
  return !!slot;
}

/** Full special-ed record (codes + remarks + exemptions + derived support). */
export async function getSpecialEdRecord(studentId: string) {
  const record = await db.specialEdRecord.findUnique({
    where: { studentId },
    select: {
      id: true,
      fileNo: true,
      remarks: true,
      frenchExempt: true,
      otherExemptions: true,
      problems: { select: { code: true, label: true }, orderBy: { code: "asc" } },
      accommodations: { select: { code: true, label: true } },
    },
  });
  if (!record) return null;
  // Accommodation codes are numeric strings — sort numerically for display.
  record.accommodations.sort((a, b) => Number(a.code) - Number(b.code));
  return record;
}

/**
 * When each of these students is in support, keyed by StudentProfile id.
 *
 * The roster filters on the day and period of a support lesson, which means it
 * needs this for the whole cohort at once. getStudentSupport() answers the same
 * question for one student and would cost a round-trip each; this is one query
 * however many students the register holds.
 *
 * Only the slot coordinates, deliberately: the roster shows when, the record
 * page shows what and with whom.
 */
export async function supportSlotsByStudent(
  studentIds: string[],
): Promise<Map<string, { dayOfWeek: number; period: number }[]>> {
  const byStudent = new Map<string, { dayOfWeek: number; period: number }[]>();
  if (studentIds.length === 0) return byStudent;

  const enrolments = await db.studentGroup.findMany({
    where: { studentProfileId: { in: studentIds }, ...SUPPORT_GROUP_WHERE },
    select: {
      studentProfileId: true,
      group: { select: { timetableSlots: { select: { dayOfWeek: true, period: true } } } },
    },
  });

  for (const e of enrolments) {
    const list = byStudent.get(e.studentProfileId) ?? [];
    for (const s of e.group.timetableSlots) list.push({ dayOfWeek: s.dayOfWeek, period: s.period });
    byStudent.set(e.studentProfileId, list);
  }
  for (const list of byStudent.values()) {
    list.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.period - b.period);
  }
  return byStudent;
}

/** The special-ed cohort (students with a record) — for the coordinator desk. */
export async function listSpecialEdStudents() {
  const records = await db.specialEdRecord.findMany({
    select: {
      studentId: true,
      student: {
        select: {
          studentId: true,
          user: { select: { name: true } },
          group: { select: { name: true, grade: true } },
        },
      },
      problems: { select: { code: true } },
      accommodations: { select: { code: true } },
    },
  });
  return records
    .map((r) => ({
      studentId: r.studentId,
      registryNo: r.student.studentId,
      name: r.student.user?.name ?? "—",
      group: r.student.group?.name ?? null,
      grade: r.student.group?.grade ?? null,
      problemCodes: r.problems.map((p) => p.code),
      accommodationCodes: r.accommodations.map((a) => a.code),
    }))
    .sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.name.localeCompare(b.name));
}

/**
 * Seed EMPTY lookup tables from the ministry defaults — rooms-style: a fresh
 * or wiped database self-initializes on first read, and the admin manages the
 * lists afterwards (Settings → Ειδική Αγωγή — Κωδικοί). Non-empty tables are
 * never touched, so admin edits survive.
 */
export async function ensureSpecialEdCodesSeeded(): Promise<void> {
  const [p, a] = await Promise.all([
    db.specialEdProblemCode.count(),
    db.specialEdAccommodation.count(),
  ]);
  if (p === 0) {
    await db.specialEdProblemCode.createMany({ data: SPECIAL_ED_PROBLEM_CODES, skipDuplicates: true });
  }
  if (a === 0) {
    await db.specialEdAccommodation.createMany({ data: SPECIAL_ED_ACCOMMODATIONS, skipDuplicates: true });
  }
}

/** Full lookup rows (incl. inactive + usage counts) for the admin settings card. */
export async function getSpecialEdCodeTables() {
  await ensureSpecialEdCodesSeeded();
  const sel = {
    id: true,
    code: true,
    label: true,
    active: true,
    _count: { select: { records: true } },
  } as const;
  const [problems, accommodations] = await Promise.all([
    db.specialEdProblemCode.findMany({ select: sel, orderBy: { code: "asc" } }),
    db.specialEdAccommodation.findMany({ select: sel }),
  ]);
  accommodations.sort((x, y) => (Number(x.code) || 9999) - (Number(y.code) || 9999) || x.code.localeCompare(y.code, "el"));
  const shape = (r: (typeof problems)[number]) => ({
    id: r.id, code: r.code, label: r.label, active: r.active, inUse: r._count.records,
  });
  return { problems: problems.map(shape), accommodations: accommodations.map(shape) };
}

/** Active lookup rows (problem codes + accommodations) for the edit form. */
export async function getSpecialEdCatalog() {
  await ensureSpecialEdCodesSeeded();
  const [problems, accommodations] = await Promise.all([
    db.specialEdProblemCode.findMany({ where: { active: true }, select: { code: true, label: true }, orderBy: { code: "asc" } }),
    db.specialEdAccommodation.findMany({ where: { active: true }, select: { code: true, label: true } }),
  ]);
  accommodations.sort((a, b) => Number(a.code) - Number(b.code));
  return { problems, accommodations };
}

/** Codes only (problem + accommodation), for the teacher reveal. */
export async function getSpecialEdCodes(studentId: string) {
  const record = await db.specialEdRecord.findUnique({
    where: { studentId },
    select: {
      problems: { select: { code: true, label: true }, orderBy: { code: "asc" } },
      accommodations: { select: { code: true, label: true } },
    },
  });
  if (!record) return null;
  record.accommodations.sort((a, b) => Number(a.code) - Number(b.code));
  return { problems: record.problems, accommodations: record.accommodations };
}

/** The groups a teacher teaches (from their claimed timetable slots). */
async function teacherGroupIds(staffId: string): Promise<string[]> {
  const slots = await db.timetableSlot.findMany({
    where: { staffId },
    select: { groupId: true },
  });
  return [...new Set(slots.map((s) => s.groupId).filter((g): g is string => !!g))];
}

/** Does the teacher teach at least one student who has a special-ed record? (nav gate) */
export async function teachesAnySpecialEd(staffId: string): Promise<boolean> {
  const groupIds = await teacherGroupIds(staffId);
  if (groupIds.length === 0) return false;
  const one = await db.specialEdRecord.findFirst({
    where: {
      student: {
        user: { isActive: true },
        OR: [{ groupId: { in: groupIds } }, { subjectGroups: { some: { groupId: { in: groupIds } } } }],
      },
    },
    select: { id: true },
  });
  return !!one;
}

/**
 * Active staff (by userId) who teach a student — i.e. have a timetable slot in
 * the student's homeroom or any subject group. This is exactly the audience of
 * the teacher special-ed tab, so it's who we notify when the record changes.
 */
export async function teacherUserIdsForStudent(studentId: string): Promise<string[]> {
  const student = await db.studentProfile.findUnique({
    where: { id: studentId },
    select: { groupId: true, subjectGroups: { select: { groupId: true } } },
  });
  if (!student) return [];
  const groupIds = [student.groupId, ...student.subjectGroups.map((g) => g.groupId)].filter(
    (g): g is string => !!g,
  );
  if (groupIds.length === 0) return [];
  const slots = await db.timetableSlot.findMany({
    where: { groupId: { in: groupIds }, staffId: { not: null } },
    select: { staff: { select: { userId: true, user: { select: { isActive: true } } } } },
  });
  const ids = new Set<string>();
  for (const s of slots) {
    if (s.staff?.userId && s.staff.user?.isActive) ids.add(s.staff.userId);
  }
  return [...ids];
}

export type TeacherSpecialEdStudent = {
  studentId: string;
  registryNo: string;
  name: string;
  group: string | null;
  remarks: string | null;
  frenchExempt: boolean;
  otherExemptions: string | null;
  problems: { code: string; label: string }[];
  accommodations: { code: string; label: string }[];
};

/**
 * Full special-ed info for every active student the teacher teaches who has a
 * record. Scoped strictly to the teacher's own groups (homeroom + subject) — the
 * same teaches-this-student boundary as the audited dossier reveal.
 */
export async function listSpecialEdForTeacher(staffId: string): Promise<TeacherSpecialEdStudent[]> {
  const groupIds = await teacherGroupIds(staffId);
  if (groupIds.length === 0) return [];
  const records = await db.specialEdRecord.findMany({
    where: {
      student: {
        user: { isActive: true },
        OR: [{ groupId: { in: groupIds } }, { subjectGroups: { some: { groupId: { in: groupIds } } } }],
      },
    },
    select: {
      remarks: true,
      frenchExempt: true,
      otherExemptions: true,
      problems: { select: { code: true, label: true }, orderBy: { code: "asc" } },
      accommodations: { select: { code: true, label: true } },
      student: {
        select: {
          id: true,
          studentId: true,
          user: { select: { name: true } },
          group: { select: { name: true } },
        },
      },
    },
  });
  return records
    .map((r) => {
      // Accommodation codes are numeric strings — sort numerically for display.
      const accommodations = [...r.accommodations].sort((a, b) => Number(a.code) - Number(b.code));
      return {
        studentId: r.student.id,
        registryNo: r.student.studentId,
        name: r.student.user?.name ?? "—",
        group: r.student.group?.name ?? null,
        remarks: r.remarks,
        frenchExempt: r.frenchExempt,
        otherExemptions: r.otherExemptions,
        problems: r.problems,
        accommodations,
      };
    })
    .sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.name.localeCompare(b.name));
}

/** Distinct code→label legend built from a teacher's roster (no extra query). */
export function specialEdLegend(students: TeacherSpecialEdStudent[]): {
  problems: { code: string; label: string }[];
  accommodations: { code: string; label: string }[];
} {
  const p = new Map<string, string>();
  const a = new Map<string, string>();
  for (const s of students) {
    for (const c of s.problems) p.set(c.code, c.label);
    for (const c of s.accommodations) a.set(c.code, c.label);
  }
  return {
    problems: [...p].map(([code, label]) => ({ code, label })).sort((x, y) => x.code.localeCompare(y.code)),
    accommodations: [...a].map(([code, label]) => ({ code, label })).sort((x, y) => Number(x.code) - Number(y.code)),
  };
}
