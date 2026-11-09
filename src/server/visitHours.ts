import { db } from "@/server/db";
import { buildVisitRows, homegroupListGroupIds, type VisitListRow } from "@/lib/visitHours";

async function rowsForGroups(input: {
  groupIds: string[];
  homegroupId: string | null;
  showGroupNames: boolean;
  homeroomGroup: { homeroomTeacherId: string | null; homeroomHeadteacherId: string | null; counselorId: string | null } | null;
}): Promise<VisitListRow[]> {
  const [slots, profiles, hours] = await Promise.all([
    db.timetableSlot.findMany({
      where: { groupId: { in: input.groupIds } },
      select: {
        staffName: true,
        groupId: true,
        group: { select: { name: true } },
        course: { select: { name: true, nameEl: true } },
      },
    }),
    db.staffProfile.findMany({ select: { id: true, scheduleName: true, department: true } }),
    db.visitHour.findMany({
      where: { staffProfileId: { not: null } },
      select: {
        staffProfileId: true, slotText: true, dayOfWeek: true, period: true,
        startTime: true, endTime: true, byAppointment: true, phone: true,
      },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  const g = input.homeroomGroup;
  return buildVisitRows({
    homegroupId: input.homegroupId,
    showGroupNames: input.showGroupNames,
    slots: slots.map((s) => ({
      staffName: s.staffName,
      groupId: s.groupId,
      groupName: s.group.name,
      courseName: s.course.nameEl || s.course.name,
    })),
    homeroom: g
      ? [
          ...(g.homeroomTeacherId ? [{ staffProfileId: g.homeroomTeacherId, role: "teacher" as const }] : []),
          ...(g.homeroomHeadteacherId ? [{ staffProfileId: g.homeroomHeadteacherId, role: "head" as const }] : []),
          ...(g.counselorId ? [{ staffProfileId: g.counselorId, role: "counselor" as const }] : []),
        ]
      : [],
    profiles,
    hours,
  });
}

const HOMEROOM_SELECT = { homeroomTeacherId: true, homeroomHeadteacherId: true, counselorId: true } as const;

/** A parent's list: the child's homegroup, the child's own groups, the homegroup's staff. */
export async function visitListForStudent(studentId: string): Promise<VisitListRow[]> {
  const student = await db.studentProfile.findUnique({
    where: { id: studentId },
    select: {
      groupId: true,
      group: { select: HOMEROOM_SELECT },
      subjectGroups: { select: { groupId: true } },
    },
  });
  if (!student) return [];
  const groupIds = [...new Set([student.groupId, ...student.subjectGroups.map((s) => s.groupId)])].filter(
    (id): id is string => !!id,
  );
  return rowsForGroups({
    groupIds,
    homegroupId: student.groupId,
    showGroupNames: false,
    homeroomGroup: student.group,
  });
}

/** A homegroup's list: its lessons and its students' subject groups, no support groups. */
export async function visitListForGroup(groupId: string): Promise<VisitListRow[]> {
  const [group, students] = await Promise.all([
    db.group.findUnique({ where: { id: groupId }, select: HOMEROOM_SELECT }),
    db.studentProfile.findMany({
      where: { groupId, user: { isActive: true } },
      select: { subjectGroups: { select: { group: { select: { id: true, name: true } } } } },
    }),
  ]);
  const subjectGroups = students.flatMap((s) => s.subjectGroups.map((sg) => sg.group));
  return rowsForGroups({
    groupIds: homegroupListGroupIds(groupId, subjectGroups),
    homegroupId: groupId,
    showGroupNames: true,
    homeroomGroup: group,
  });
}
