import type { Prisma } from "@/generated/prisma/client";

/**
 * The students who sit a test of `groupId`: active, with it as their
 * homegroup or enrolled in it as a subject group. Shared by the grade page,
 * the teacher's list (grading status) and the Κ9 report.
 */
export function testStudentsWhere(groupId: string): Prisma.StudentProfileWhereInput {
  return {
    OR: [{ groupId }, { subjectGroups: { some: { groupId } } }],
    user: { isActive: true },
  };
}
