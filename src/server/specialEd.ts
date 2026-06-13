import { db } from "@/server/db";
import { parseSupportGroup, type SupportKind } from "@/lib/specialEd";

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
    where: {
      studentProfileId: studentId,
      OR: [{ group: { name: { startsWith: "ΣΤ_" } } }, { group: { name: { startsWith: "ΑΣΤ_" } } }],
    },
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

/** Active lookup rows (problem codes + accommodations) for the edit form. */
export async function getSpecialEdCatalog() {
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
