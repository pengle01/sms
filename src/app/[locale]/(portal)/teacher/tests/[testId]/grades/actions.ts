"use server";

import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { revalidatePath } from "next/cache";

export type SaveGradesResult = { success: true } | { success: false; message: string };

export async function saveTestGrades(
  testId: string,
  grades: { studentId: string; value: string }[]
): Promise<SaveGradesResult> {
  const session = await getServerSession(authOptions);
  if (!session) return { success: false, message: "Unauthenticated" };

  const staff = await db.staffProfile.findUnique({ where: { userId: session.user.id } });
  if (!staff) return { success: false, message: "No staff profile" };

  const test = await db.testSchedule.findUnique({ where: { id: testId } });
  if (!test) return { success: false, message: "Test not found" };
  if (test.staffId !== staff.id) return { success: false, message: "Not authorized" };

  for (const g of grades) {
    const rawValue = g.value.trim();
    const parsed = rawValue === "" ? null : parseFloat(rawValue);
    if (parsed !== null && (isNaN(parsed) || parsed < 0 || parsed > 20)) {
      return { success: false, message: `Invalid grade value: ${rawValue}` };
    }

    await db.testGrade.upsert({
      where: { testScheduleId_studentId: { testScheduleId: testId, studentId: g.studentId } },
      update: { value: parsed === null ? null : parsed },
      create: {
        testScheduleId: testId,
        studentId: g.studentId,
        value: parsed === null ? null : parsed,
      },
    });
  }

  revalidatePath("/[locale]/teacher/tests/[testId]/grades", "page");
  return { success: true };
}
