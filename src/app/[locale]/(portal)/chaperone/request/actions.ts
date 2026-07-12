"use server";

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth";
import { db } from "@/server/db";
import { Prisma } from "@/generated/prisma/client";

export async function submitChaperoneRequestAction(formData: FormData) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "CHAPERONE") redirect("/");

  const locale = (formData.get("locale") as string) ?? "el";
  const note = ((formData.get("note") as string) ?? "").trim() || null;
  const studentIds = formData.getAll("studentId") as string[];

  if (studentIds.length === 0) redirect(`/${locale}/chaperone/request?error=noStudents`);

  // Verify all student IDs exist
  const students = await db.studentProfile.findMany({
    where: { id: { in: studentIds } },
    select: { id: true },
  });
  if (students.length === 0) redirect(`/${locale}/chaperone/request?error=noStudents`);

  const createData: Prisma.ChaperoneRequestUncheckedCreateInput = {
    userId: session.user.id,
    note,
    status: "PENDING",
    students: {
      create: students.map((s) => ({ studentProfileId: s.id })),
    },
  };

  await db.chaperoneRequest.create({ data: createData });
  redirect(`/${locale}/chaperone/students?requested=1`);
}
