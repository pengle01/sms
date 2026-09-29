"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";
import { utcMidnight } from "@/lib/dates";
import { generatePlan, finalizePlan, getCoordinatorStaff } from "@/server/substitutions";
import { analyseImport, applyImport } from "@/server/substitutionImport";
import { IMPORT_MAX_BYTES, countByKind, type ImportIssue } from "@/lib/substitutionImport";

const PAGE = "/[locale]/(portal)/teacher/substitutions/plan";

async function requireCoordinator() {
  const auth = await getActiveAuth();
  if (!auth) return null;
  const staff = await getCoordinatorStaff(auth.userId);
  if (!staff) return null;
  return { auth, staff };
}

export async function generatePlanAction(locale: string, dateStr: string) {
  const ctx = await requireCoordinator();
  if (!ctx) redirect(`/${locale}/teacher/substitutions`);
  const res = await generatePlan(utcMidnight(dateStr), ctx.auth.userId);
  revalidatePath(PAGE, "page");
  redirect(`/${locale}/teacher/substitutions/plan?date=${dateStr}${res.ok ? "" : `&error=${res.error}`}`);
}

export async function finalizePlanAction(locale: string, dateStr: string) {
  const ctx = await requireCoordinator();
  if (!ctx) redirect(`/${locale}/teacher/substitutions`);
  const res = await finalizePlan(utcMidnight(dateStr), ctx.auth.userId);
  revalidatePath(PAGE, "page");
  redirect(`/${locale}/teacher/substitutions/plan?date=${dateStr}${res.ok ? "&finalized=1" : `&error=${res.error}`}`);
}

/** Coordinator override: pick a different substitute (or none → study hall). */
export async function overrideSubstitute(
  locale: string,
  dateStr: string,
  entryId: string,
  formData: FormData
) {
  const ctx = await requireCoordinator();
  if (!ctx) redirect(`/${locale}/teacher/substitutions`);

  const staffId = ((formData.get("staffId") as string) ?? "").trim();
  const entry = await db.substitutionPlanEntry.findFirst({
    where: { id: entryId, plan: { status: "DRAFT" }, kind: { in: ["COVER", "STUDY_HALL", "SWAP"] } },
  });
  if (entry) {
    await db.substitutionPlanEntry.update({
      where: { id: entry.id },
      data: staffId
        ? {
            kind: "COVER",
            substituteStaffId: staffId,
            rankInfo: "Χειροκίνητη επιλογή συντονιστή",
            note: null,
          }
        : {
            kind: "STUDY_HALL",
            substituteStaffId: null,
            rankInfo: null,
            note: "Φ/δι εφημ ΒΔ (επιλογή συντονιστή)",
            newRoom: "κιόσκια",
          },
    });
    await writeAudit({
      userId: ctx.auth.userId,
      action: "substitution.override",
      resource: "SubstitutionPlanEntry",
      resourceId: entry.id,
      details: { substituteStaffId: staffId || null },
      ...(await requestMeta()),
    });
  }
  revalidatePath(PAGE, "page");
  redirect(`/${locale}/teacher/substitutions/plan?date=${dateStr}`);
}

export async function deletePlanEntry(locale: string, dateStr: string, entryId: string) {
  const ctx = await requireCoordinator();
  if (!ctx) redirect(`/${locale}/teacher/substitutions`);
  const entry = await db.substitutionPlanEntry.findFirst({
    where: { id: entryId, plan: { status: "DRAFT" } },
  });
  if (entry) {
    await db.substitutionPlanEntry.delete({ where: { id: entry.id } });
    await writeAudit({
      userId: ctx.auth.userId,
      action: "substitution.entryDelete",
      resource: "SubstitutionPlanEntry",
      resourceId: entry.id,
      details: { kind: entry.kind, period: entry.period },
      ...(await requestMeta()),
    });
  }
  revalidatePath(PAGE, "page");
  redirect(`/${locale}/teacher/substitutions/plan?date=${dateStr}`);
}

/** Per-teacher substitution quota (null = unlimited, 0 = never). */
export async function updateQuota(locale: string, staffId: string, formData: FormData) {
  const ctx = await requireCoordinator();
  if (!ctx) redirect(`/${locale}/teacher/substitutions`);

  const raw = ((formData.get("max") as string) ?? "").trim();
  const value = raw === "" ? null : parseInt(raw);
  if (value === null || (Number.isInteger(value) && value >= 0)) {
    await db.staffProfile.update({ where: { id: staffId }, data: { maxSubstitutions: value } });
    await writeAudit({
      userId: ctx.auth.userId,
      action: "substitution.quota",
      resource: "StaffProfile",
      resourceId: staffId,
      details: { maxSubstitutions: value },
      ...(await requestMeta()),
    });
  }
  revalidatePath(PAGE, "page");
  redirect(`/${locale}/teacher/substitutions/plan?tab=quotas`);
}

// ── Import from SchoolAbsence ────────────────────────────────────────────────

export type ImportPreview =
  | { ok: false; error: ImportIssue }
  | {
      ok: true;
      date: string;
      dayName: string | null;
      exportedAt: string | null;
      counts: ReturnType<typeof countByKind>;
      absences: number;
      duty: number;
      errors: ImportIssue[];
      warnings: ImportIssue[];
      existing: "DRAFT" | "FINAL" | null;
    };

function tooLarge(raw: string) {
  return new TextEncoder().encode(raw).length > IMPORT_MAX_BYTES;
}

/** Check an uploaded SchoolAbsence file against the timetable. Writes nothing. */
export async function previewImportAction(raw: string): Promise<ImportPreview> {
  if (!(await requireCoordinator())) return { ok: false, error: { code: "notAllowed" } };
  if (tooLarge(raw)) return { ok: false, error: { code: "tooLarge" } };
  const a = await analyseImport(raw);
  if (!a.ok) return a;
  return {
    ok: true,
    date: a.result.date,
    dayName: a.dayName,
    exportedAt: a.result.meta.exportedAt,
    counts: countByKind(a.result.entries),
    absences: a.result.meta.absences.length,
    duty: a.result.meta.duty.length,
    errors: a.result.errors,
    warnings: a.result.warnings,
    existing: a.existing,
  };
}

/**
 * Import the file as the date's DRAFT plan. Everything is checked again here —
 * nothing from the preview is trusted — and a file with any error is refused.
 */
export async function importPlanAction(
  raw: string,
): Promise<{ ok: true; date: string } | { ok: false; errors: ImportIssue[] }> {
  const ctx = await requireCoordinator();
  if (!ctx) return { ok: false, errors: [{ code: "notAllowed" }] };
  if (tooLarge(raw)) return { ok: false, errors: [{ code: "tooLarge" }] };
  const a = await analyseImport(raw);
  if (!a.ok) return { ok: false, errors: [a.error] };
  if (a.result.errors.length > 0) return { ok: false, errors: a.result.errors };

  await applyImport(a.result, ctx.auth.userId);
  await writeAudit({
    userId: ctx.auth.userId,
    action: "substitution.import",
    resource: "SubstitutionPlan",
    resourceId: a.result.date,
    details: {
      source: "SchoolAbsence",
      exportedAt: a.result.meta.exportedAt,
      entries: a.result.entries.length,
      counts: countByKind(a.result.entries),
      absences: a.result.meta.absences.length,
      duty: a.result.meta.duty.length,
      replaced: a.existing,
    },
    ...(await requestMeta()),
  });
  revalidatePath(PAGE, "page");
  return { ok: true, date: a.result.date };
}
