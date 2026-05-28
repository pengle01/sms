"use server";

import { db } from "@/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth";
import { revalidatePath } from "next/cache";
import { utcMidnight } from "@/lib/dates";

async function requireSuperAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "SUPER_ADMIN") throw new Error("Forbidden");
}

// ── School Terms ──────────────────────────────────────────────────────────────

export async function createTerm(data: {
  label: string;
  startDate: string;
  endDate: string;
  testDeadline: string;
}) {
  await requireSuperAdmin();
  await db.schoolTerm.create({
    data: {
      label: data.label.trim(),
      startDate: utcMidnight(data.startDate),
      endDate: utcMidnight(data.endDate),
      testDeadline: utcMidnight(data.testDeadline),
    },
  });
  revalidatePath("/[locale]/admin/calendar", "page");
}

export async function updateTerm(
  id: string,
  data: { label: string; startDate: string; endDate: string; testDeadline: string }
) {
  await requireSuperAdmin();
  await db.schoolTerm.update({
    where: { id },
    data: {
      label: data.label.trim(),
      startDate: utcMidnight(data.startDate),
      endDate: utcMidnight(data.endDate),
      testDeadline: utcMidnight(data.testDeadline),
    },
  });
  revalidatePath("/[locale]/admin/calendar", "page");
}

export async function deleteTerm(id: string) {
  await requireSuperAdmin();
  await db.schoolTerm.delete({ where: { id } });
  revalidatePath("/[locale]/admin/calendar", "page");
}

// ── Special Days ──────────────────────────────────────────────────────────────

import type { SpecialDayType } from "@/generated/prisma";

export async function createSpecialDay(data: {
  type: SpecialDayType;
  startDate: string;
  endDate: string;
  label?: string;
  intercalaryMeetingPeriod?: number;
}) {
  await requireSuperAdmin();
  await db.specialDay.create({
    data: {
      type: data.type,
      startDate: utcMidnight(data.startDate),
      endDate: utcMidnight(data.endDate),
      label: data.label?.trim() || null,
      intercalaryMeetingPeriod: data.type === "INTERCALARY" ? (data.intercalaryMeetingPeriod ?? 8) : null,
    },
  });
  revalidatePath("/[locale]/admin/calendar", "page");
}

export async function updateSpecialDay(
  id: string,
  data: { type: SpecialDayType; startDate: string; endDate: string; label?: string; intercalaryMeetingPeriod?: number }
) {
  await requireSuperAdmin();
  await db.specialDay.update({
    where: { id },
    data: {
      type: data.type,
      startDate: utcMidnight(data.startDate),
      endDate: utcMidnight(data.endDate),
      label: data.label?.trim() || null,
      intercalaryMeetingPeriod: data.type === "INTERCALARY" ? (data.intercalaryMeetingPeriod ?? 8) : null,
    },
  });
  revalidatePath("/[locale]/admin/calendar", "page");
}

export async function deleteSpecialDay(id: string) {
  await requireSuperAdmin();
  await db.specialDay.delete({ where: { id } });
  revalidatePath("/[locale]/admin/calendar", "page");
}
