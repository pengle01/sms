"use server";

import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { revalidatePath } from "next/cache";
import { utcMidnight } from "@/lib/dates";

async function requireSuperAdmin() {
  const auth = await getSuperAdminAuth();
  if (!auth) throw new Error("Forbidden");
}

// School terms are no longer managed here — term dates (and test deadlines)
// live in the "termDates" GlobalSetting, edited under Settings → School Year
// & Terms.

// ── Special Days ──────────────────────────────────────────────────────────────

import type { SpecialDayType } from "@/generated/prisma/client";

export async function createSpecialDay(data: {
  type: SpecialDayType;
  startDate: string;
  endDate: string;
  label?: string;
  intercalaryMeetingPeriod?: number;
  eventStartPeriod?: number;
  eventEndPeriod?: number;
}) {
  await requireSuperAdmin();
  await db.specialDay.create({
    data: {
      type: data.type,
      startDate: utcMidnight(data.startDate),
      endDate: utcMidnight(data.endDate),
      label: data.label?.trim() || null,
      intercalaryMeetingPeriod: data.type === "INTERCALARY" ? (data.intercalaryMeetingPeriod ?? 8) : null,
      eventStartPeriod: data.type === "SCHOOL_EVENT" ? (data.eventStartPeriod ?? 1) : null,
      eventEndPeriod: data.type === "SCHOOL_EVENT" ? (data.eventEndPeriod ?? 1) : null,
    },
  });
  revalidatePath("/[locale]/admin/calendar", "page");
}

export async function updateSpecialDay(
  id: string,
  data: { type: SpecialDayType; startDate: string; endDate: string; label?: string; intercalaryMeetingPeriod?: number; eventStartPeriod?: number; eventEndPeriod?: number }
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
      eventStartPeriod: data.type === "SCHOOL_EVENT" ? (data.eventStartPeriod ?? 1) : null,
      eventEndPeriod: data.type === "SCHOOL_EVENT" ? (data.eventEndPeriod ?? 1) : null,
    },
  });
  revalidatePath("/[locale]/admin/calendar", "page");
}

export async function deleteSpecialDay(id: string) {
  await requireSuperAdmin();
  await db.specialDay.delete({ where: { id } });
  revalidatePath("/[locale]/admin/calendar", "page");
}
