import { db } from "@/server/db";
import type { Prisma } from "@/generated/prisma/client";
import { getPeriodsPerDay } from "@/lib/schoolConfig";
import { lastPeriodFor } from "@/lib/substitutions";
import { utcMidnight } from "@/lib/dates";
import {
  SCHOOL_ABSENCE_SOURCE,
  normName,
  parseSchoolAbsence,
  resolveImport,
  weekdayOf,
  type ImportIssue,
  type ImportLookups,
  type ImportResult,
  type StaffRef,
} from "@/lib/substitutionImport";

/**
 * The app's timetable for one weekday, keyed the way resolveImport compares
 * names. A lesson's teacher is the imported `staffName`, falling back to the
 * claimed profile's code — the same resolution the plan engine uses.
 */
export async function buildImportLookups(weekday: number): Promise<ImportLookups> {
  const [groupRows, slotRows, staffRows, periods] = await Promise.all([
    db.group.findMany({ select: { id: true, name: true } }),
    db.timetableSlot.findMany({
      where: { dayOfWeek: weekday },
      select: { id: true, groupId: true, period: true, staffName: true, staff: { select: { scheduleName: true } } },
    }),
    db.staffProfile.findMany({
      where: { scheduleName: { not: null } },
      select: { id: true, scheduleName: true, userId: true, user: { select: { isActive: true } } },
    }),
    getPeriodsPerDay(),
  ]);

  const groups = new Map(groupRows.map((g) => [normName(g.name), g.id]));
  const slots = new Map(
    slotRows.map((s) => [`${s.groupId}:${s.period}`, { id: s.id, staffName: s.staffName ?? s.staff?.scheduleName ?? null }]),
  );
  // Two profiles with one code can't be told apart — never guess which.
  const staff = new Map<string, StaffRef | "ambiguous">();
  for (const s of staffRows) {
    const key = normName(s.scheduleName!);
    staff.set(key, staff.has(key) ? "ambiguous" : { id: s.id, hasLogin: !!s.userId && !!s.user?.isActive });
  }
  return { groups, slots, staff, lastPeriod: lastPeriodFor(weekday, periods) };
}

export type ImportAnalysis =
  | { ok: false; error: ImportIssue }
  | { ok: true; result: ImportResult; dayName: string | null; existing: "DRAFT" | "FINAL" | null };

/** Parse and check a file against the timetable. Writes nothing. */
export async function analyseImport(raw: string): Promise<ImportAnalysis> {
  const parsed = parseSchoolAbsence(raw);
  if (!parsed.ok) return parsed;
  const { file } = parsed;

  const weekday = weekdayOf(file.date);
  const lookups: ImportLookups = weekday
    ? await buildImportLookups(weekday)
    : { groups: new Map(), slots: new Map(), staff: new Map(), lastPeriod: 7 };
  const result = resolveImport(file, lookups);

  const existing = weekday
    ? await db.substitutionPlan.findUnique({ where: { date: utcMidnight(file.date) }, select: { status: true } })
    : null;
  return { ok: true, result, dayName: file.dayName?.trim() || null, existing: existing?.status ?? null };
}

/**
 * Replace the date's plan with the imported one, as a DRAFT — the same shape
 * generatePlan uses, so a FINAL plan goes back to DRAFT and must be finalized
 * again. Callers must only pass a result with no errors.
 */
export async function applyImport(result: ImportResult, userId: string): Promise<void> {
  if (result.errors.length > 0) throw new Error("applyImport called with a refused import");
  const date = utcMidnight(result.date);
  const importMeta = result.meta as unknown as Prisma.InputJsonValue;

  await db.$transaction(async (tx) => {
    const plan = await tx.substitutionPlan.upsert({
      where: { date },
      create: { date, status: "DRAFT", generatedById: userId, source: SCHOOL_ABSENCE_SOURCE, importMeta },
      update: {
        status: "DRAFT",
        generatedById: userId,
        finalizedById: null,
        finalizedAt: null,
        source: SCHOOL_ABSENCE_SOURCE,
        importMeta,
      },
    });
    await tx.substitutionPlanEntry.deleteMany({ where: { planId: plan.id } });
    if (result.entries.length > 0) {
      await tx.substitutionPlanEntry.createMany({
        data: result.entries.map((e) => ({ planId: plan.id, ...e })),
      });
    }
  });
}
