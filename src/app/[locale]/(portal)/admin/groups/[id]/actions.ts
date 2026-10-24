"use server";

import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { revalidatePath } from "next/cache";
import { writeAudit, requestMeta } from "@/server/audit";
import { groupDeleteBlockers, type GroupDeleteBlocker } from "@/lib/groupDelete";

export async function assignHomeroomTeacher(groupId: string, staffId: string | null) {
  const auth = await getSuperAdminAuth();
  if (!auth) throw new Error("Forbidden");

  await db.group.update({
    where: { id: groupId },
    data: { homeroomTeacherId: staffId },
  });

  revalidatePath(`/[locale]/admin/groups/${groupId}`, "page");
}

export type DeleteGroupResult = { ok: true } | { ok: false; reasons: GroupDeleteBlocker[] | ["notFound"] };

/**
 * Delete a group nothing uses — no students, no enrolments, no lessons in the
 * current timetable, no history (groupDeleteBlockers). Its teacher-course
 * assignments, which are only configuration, go with it.
 */
export async function deleteEmptyGroup(groupId: string): Promise<DeleteGroupResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) throw new Error("Forbidden");

  const group = await db.group.findUnique({
    where: { id: groupId },
    select: {
      name: true,
      _count: {
        select: {
          students: true,
          studentGroups: true,
          testSchedules: true,
          referrals: true,
          referralStudents: true,
          substitutionRequests: true,
          substitutionPlanEntries: true,
          toiletBreaks: true,
          attendanceExports: true,
        },
      },
    },
  });
  if (!group) return { ok: false, reasons: ["notFound"] };

  const [lessons, removedLessons, homegroupRegisters, lessonNotes] = await Promise.all([
    db.timetableSlot.count({ where: { groupId } }),
    // Lessons a re-import hid because they have attendance (naming removedAt opts out of the db.ts filter).
    db.timetableSlot.count({ where: { groupId, removedAt: { not: null } } }),
    db.attendance.count({ where: { intercalaryGroupId: groupId } }),
    db.lessonNote.count({ where: { groupId } }),
  ]);
  const c = group._count;
  const reasons = groupDeleteBlockers({
    students: c.students,
    enrolled: c.studentGroups,
    lessons,
    historyCounts: [
      removedLessons, homegroupRegisters, lessonNotes, c.testSchedules, c.referrals, c.referralStudents,
      c.substitutionRequests, c.substitutionPlanEntries, c.toiletBreaks, c.attendanceExports,
    ],
  });
  if (reasons.length > 0) return { ok: false, reasons };

  await db.$transaction([
    db.courseAssignment.deleteMany({ where: { groupId } }),
    db.group.delete({ where: { id: groupId } }),
  ]);
  await writeAudit({
    userId: auth.userId,
    action: "group.delete",
    resource: "Group",
    resourceId: groupId,
    details: { name: group.name },
    ...(await requestMeta()),
  });
  revalidatePath("/[locale]/(portal)/admin/groups", "page");
  revalidatePath("/[locale]/(portal)/admin/checks", "page");
  return { ok: true };
}
