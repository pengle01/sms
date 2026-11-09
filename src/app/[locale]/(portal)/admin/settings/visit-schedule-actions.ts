"use server";

import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManageClaims } from "@/lib/rbac";
import { getActiveAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";
import { db } from "@/server/db";
import { matchVisitEntries, parseVisitSchedule, type VisitEntry } from "@/lib/visitHours";

async function requireAdmin() {
  const auth = await getActiveAuth();
  if (!auth || !auth.roles.some(canManageClaims)) redirect("/");
  return auth;
}

async function readFile(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return null;
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, defval: "" });
  return parseVisitSchedule(rows);
}

async function matchingData() {
  const [staff, saved] = await Promise.all([
    db.staffProfile.findMany({
      where: { scheduleName: { not: null }, leftTimetableAt: null },
      select: { id: true, scheduleName: true },
      orderBy: { scheduleName: "asc" },
    }),
    db.visitHourMatch.findMany({ select: { entryKey: true, staffProfileId: true } }),
  ]);
  return { staff, saved: new Map(saved.map((s) => [s.entryKey, s.staffProfileId])) };
}

export type VisitPreview =
  | {
      ok: true;
      entries: { key: string; fileName: string; section: string; slotText: string; staffProfileId: string | null }[];
      staff: { id: string; name: string }[];
      unreadable: string[];
    }
  | { ok: false; error: "noFile" | "noTeachers" };

/** Reads the file and proposes matches. Writes nothing. */
export async function previewVisitSchedule(formData: FormData): Promise<VisitPreview> {
  await requireAdmin();
  const parsed = await readFile(formData);
  if (!parsed) return { ok: false, error: "noFile" };
  if (parsed.entries.length === 0) return { ok: false, error: "noTeachers" };
  const { staff, saved } = await matchingData();
  const matches = matchVisitEntries(parsed.entries, staff, saved);
  return {
    ok: true,
    entries: parsed.entries.map((e) => ({
      key: e.key,
      fileName: e.fileName,
      section: e.section,
      slotText: e.slotText,
      staffProfileId: matches.get(e.key) ?? null,
    })),
    staff: staff.map((s) => ({ id: s.id, name: s.scheduleName! })),
    unreadable: parsed.unreadable,
  };
}

export type VisitSaveResult = { ok: true; saved: number; unmatched: number } | { ok: false; error: "noFile" | "noTeachers" };

/**
 * The file becomes the whole schedule. `choices` (entry key → staff record, ""
 * for nobody) are the admin's corrections; those that differ from the automatic
 * match are remembered for the next upload.
 */
export async function saveVisitSchedule(formData: FormData): Promise<VisitSaveResult> {
  const auth = await requireAdmin();
  const parsed = await readFile(formData);
  if (!parsed) return { ok: false, error: "noFile" };
  if (parsed.entries.length === 0) return { ok: false, error: "noTeachers" };

  let choices: Record<string, unknown> = {};
  try {
    const raw: unknown = JSON.parse(String(formData.get("choices") ?? "{}"));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) choices = raw as Record<string, unknown>;
  } catch {
    // no corrections
  }

  const { staff, saved } = await matchingData();
  const known = new Set(staff.map((s) => s.id));
  const automatic = matchVisitEntries(parsed.entries, staff, saved);
  const finalId = (e: VisitEntry): string | null => {
    const choice = choices[e.key];
    if (choice === "") return null;
    if (typeof choice === "string" && known.has(choice)) return choice;
    return automatic.get(e.key) ?? null;
  };
  const remembered = parsed.entries.flatMap((e) => {
    const id = finalId(e);
    return id && (id !== automatic.get(e.key) || saved.get(e.key) === id) ? [{ entryKey: e.key, staffProfileId: id }] : [];
  });
  const forgotten = parsed.entries.filter((e) => choices[e.key] === "").map((e) => e.key);

  await db.$transaction([
    db.visitHour.deleteMany({}),
    db.visitHour.createMany({
      data: parsed.entries.map((e, sortOrder) => ({
        staffProfileId: finalId(e),
        entryKey: e.key,
        fileName: e.fileName,
        section: e.section,
        slotText: e.slotText,
        dayOfWeek: e.dayOfWeek,
        period: e.period,
        startTime: e.startTime,
        endTime: e.endTime,
        byAppointment: e.byAppointment,
        phone: e.phone,
        sortOrder,
      })),
    }),
    db.visitHourMatch.deleteMany({ where: { entryKey: { in: [...remembered.map((r) => r.entryKey), ...forgotten] } } }),
    db.visitHourMatch.createMany({ data: remembered, skipDuplicates: true }),
  ]);

  const unmatched = parsed.entries.filter((e) => !finalId(e)).length;
  await writeAudit({
    ...(await requestMeta()),
    userId: auth.userId,
    action: "visitSchedule.upload",
    resource: "VisitHour",
    details: { entries: parsed.entries.length, unmatched, unreadable: parsed.unreadable.length },
  });
  revalidatePath("/", "layout");
  return { ok: true, saved: parsed.entries.length, unmatched };
}
