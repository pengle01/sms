"use server";

import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { revalidatePath } from "next/cache";
import { isManagement } from "@/lib/rbac";
import { parseGradeInput, isGradePeriod } from "@/lib/grades";
import { getGradesUnlocked } from "@/lib/schoolConfig";
import { writeAudit, requestMeta } from "@/server/audit";
import type { Role } from "@/generated/prisma/client";

export type SaveGradesResult = { success: true } | { success: false; message: string };

export async function saveGrades(input: {
  courseId: string;
  groupId: string;
  period: string;
  grades: { studentId: string; value: string }[];
}): Promise<SaveGradesResult> {
  const session = await getServerSession(authOptions);
  if (!session) return { success: false, message: "Unauthenticated" };

  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id } });
  if (!staff) return { success: false, message: "No staff profile" };

  if (!isGradePeriod(input.period)) return { success: false, message: "Invalid term" };

  // Terms stay frozen until the super admin unlocks them in Settings.
  const unlocked = await getGradesUnlocked();
  if (!unlocked[input.period]) {
    return { success: false, message: "Η βαθμολογία του τετραμήνου είναι κλειδωμένη." };
  }

  const role = session.user.role as Role;

  // Authorize: must teach this (group, course), unless management.
  if (!isManagement(role)) {
    const teaches = await db.timetableSlot.findFirst({
      where: { staffId: staff.id, groupId: input.groupId, courseId: input.courseId },
      select: { id: true },
    });
    if (!teaches) return { success: false, message: "Not authorized" };
  }

  // Restrict to students who actually belong to this lesson (group homeroom or
  // subject-enrolled) — prevents writing grades for arbitrary student IDs.
  const lessonStudents = await db.studentProfile.findMany({
    where: {
      OR: [{ groupId: input.groupId }, { subjectGroups: { some: { groupId: input.groupId } } }],
    },
    select: { id: true },
  });
  const allowed = new Set(lessonStudents.map((s) => s.id));

  // Validate all values before writing anything.
  const parsed: { studentId: string; value: number | null }[] = [];
  for (const g of input.grades) {
    if (!allowed.has(g.studentId)) continue;
    const r = parseGradeInput(g.value);
    if (!r.ok) return { success: false, message: `Invalid grade value: ${g.value}` };
    parsed.push({ studentId: g.studentId, value: r.value });
  }

  await db.$transaction(
    parsed.map((g) =>
      g.value === null
        ? db.grade.deleteMany({
            where: { studentId: g.studentId, courseId: input.courseId, period: input.period },
          })
        : db.grade.upsert({
            where: {
              studentId_courseId_period: {
                studentId: g.studentId,
                courseId: input.courseId,
                period: input.period,
              },
            },
            create: {
              studentId: g.studentId,
              courseId: input.courseId,
              staffId: staff.id,
              period: input.period,
              value: g.value,
            },
            update: { value: g.value, staffId: staff.id },
          })
    )
  );

  const meta = await requestMeta();
  await writeAudit({
    userId: session.user.id,
    action: "grade.save",
    resource: "Grade",
    resourceId: `${input.groupId}:${input.courseId}:${input.period}`,
    details: { count: parsed.length },
    ...meta,
  });

  revalidatePath("/[locale]/teacher/grades/[groupId]/[courseId]", "page");
  return { success: true };
}
