"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";

/**
 * The admin removes any test, past or upcoming, whoever scheduled it. Its
 * grades go with it (TestGrade cascades); the audit keeps what was deleted.
 */
export async function adminDeleteTest(testId: string): Promise<{ ok: boolean }> {
  const auth = await getSuperAdminAuth();
  if (!auth) return { ok: false };

  const test = await db.testSchedule.findUnique({
    where: { id: testId },
    select: {
      date: true,
      period: true,
      periodCount: true,
      type: true,
      course: { select: { name: true } },
      group: { select: { name: true } },
      staff: { select: { scheduleName: true } },
      _count: { select: { testGrades: true } },
    },
  });
  if (!test) return { ok: false };

  await db.testSchedule.delete({ where: { id: testId } });
  await writeAudit({
    userId: auth.userId,
    action: "test.adminDelete",
    resource: "TestSchedule",
    resourceId: testId,
    details: {
      date: test.date.toISOString().slice(0, 10),
      period: test.period,
      periodCount: test.periodCount,
      type: test.type,
      course: test.course.name,
      group: test.group.name,
      teacher: test.staff.scheduleName,
      gradesDeleted: test._count.testGrades,
    },
    ...(await requestMeta()),
  });

  revalidatePath("/[locale]/admin/tests", "page");
  revalidatePath("/[locale]/teacher/tests", "page");
  return { ok: true };
}
