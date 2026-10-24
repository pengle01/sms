import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { slotTeacherName } from "@/lib/staffName";
import { canViewSpecialEdFull } from "@/lib/specialEd";
import {
  canSeeGroupList,
  groupKind,
  groupStudents,
  type GroupEntry,
  type GroupKind,
  type ListStudent,
} from "@/lib/groupList";

const ACTIVE = { user: { isActive: true } } as const;

/**
 * May the current user see this kind of group's students? Read fresh, like
 * every designation: support groups need full special-education access.
 */
export async function groupListAccess(): Promise<((kind: GroupKind) => boolean) | null> {
  const auth = await getActiveAuth();
  if (!auth) return null;
  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: { specialEducation: true },
  });
  const specialEdFull = canViewSpecialEdFull(auth.roles, !!staff?.specialEducation);
  return (kind) => canSeeGroupList(auth.roles, kind, specialEdFull);
}

/** Every group with its kind and how many active students it has. */
export async function loadGroupIndex(): Promise<(GroupEntry & { grade: number; count: number })[]> {
  const groups = await db.group.findMany({
    select: {
      id: true,
      name: true,
      grade: true,
      _count: {
        select: {
          students: { where: ACTIVE },
          studentGroups: { where: { studentProfile: ACTIVE } },
        },
      },
    },
    orderBy: { name: "asc" },
  });
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    grade: g.grade,
    kind: groupKind(g.name, g._count.students),
    // A student is a group's member one way or the other, never both.
    count: g._count.students + g._count.studentGroups,
  }));
}

export interface GroupDetail {
  id: string;
  name: string;
  kind: GroupKind;
  students: ListStudent[];
  /** "Course · Teacher" for each lesson the group has in the timetable. */
  lessons: string[];
}

/** One group with its students and lessons, or null when it doesn't exist. */
export async function loadGroupDetail(id: string): Promise<GroupDetail | null> {
  const group = await db.group.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!group) return null;

  const [homegroupRows, enrolledRows, slots] = await Promise.all([
    db.studentProfile.findMany({
      where: { groupId: id, ...ACTIVE },
      select: { id: true, studentId: true, user: { select: { name: true } }, group: { select: { name: true } } },
    }),
    db.studentProfile.findMany({
      where: { subjectGroups: { some: { groupId: id } }, ...ACTIVE },
      select: { id: true, studentId: true, user: { select: { name: true } }, group: { select: { name: true } } },
    }),
    db.timetableSlot.findMany({
      where: { groupId: id },
      select: {
        staffName: true,
        course: { select: { name: true, nameEl: true } },
        staff: { select: { scheduleName: true, user: { select: { name: true } } } },
      },
    }),
  ]);

  const toRow = (s: (typeof homegroupRows)[number]): ListStudent => ({
    id: s.id,
    studentId: s.studentId,
    name: s.user?.name ?? "",
    homegroup: s.group?.name ?? null,
  });
  const lessons = [
    ...new Set(slots.map((s) => `${s.course.nameEl || s.course.name} · ${slotTeacherName(s)}`)),
  ].sort((a, b) => a.localeCompare(b, "el"));

  return {
    id: group.id,
    name: group.name,
    kind: groupKind(group.name, homegroupRows.length),
    students: groupStudents([...homegroupRows.map(toRow), ...enrolledRows.map(toRow)]),
    lessons,
  };
}
