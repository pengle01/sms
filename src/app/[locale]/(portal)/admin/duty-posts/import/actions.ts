"use server";

import * as XLSX from "xlsx";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { getSuperAdminAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";
import { parseDutyWorkbook, dutyNameKey, isPlaceholderName, type ParsedPost } from "@/lib/breakDuty";
import { staffByDutyKey } from "@/server/breakDuty";

export interface DutyPreview {
  ok: boolean;
  error?: string;
  sheetNames: string[];
  sheet: string;
  posts: (ParsedPost & { unmatched: string[]; placeholders: string[] })[];
  /** Weekday → the file's deputy cells, and the roster's deputies in Ρυθμίσεις. */
  deputies: Record<number, { file: string[]; roster: string[] }>;
  warnings: string[];
  assignments: number;
  /** The parsed programme, sent back unchanged to «Εισαγωγή». */
  payload: string;
}

const EMPTY: Omit<DutyPreview, "ok"> = { sheetNames: [], sheet: "", posts: [], deputies: {}, warnings: [], assignments: 0, payload: "" };

/** Step 1: read the chosen sheet and show what would be imported. Nothing is saved. */
export async function previewDutyFile(_prev: DutyPreview | null, formData: FormData): Promise<DutyPreview> {
  const auth = await getSuperAdminAuth();
  if (!auth) return { ok: false, error: "Χωρίς εξουσιοδότηση", ...EMPTY };

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "Δεν επιλέχθηκε αρχείο", ...EMPTY };

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  } catch {
    return { ok: false, error: "Το αρχείο δεν διαβάζεται ως Excel.", ...EMPTY };
  }
  const wanted = (formData.get("sheet") as string | null) ?? "";
  const sheet = wb.SheetNames.includes(wanted) ? wanted : wb.SheetNames[0]!;
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheet]!, { header: 1, defval: "" });
  const parsed = parseDutyWorkbook(rows);

  const [byKey, roster] = await Promise.all([
    staffByDutyKey(),
    db.dutyRosterEntry.findMany({
      select: { dayOfWeek: true, staffProfile: { select: { scheduleName: true, user: { select: { name: true } } } } },
    }),
  ]);

  const posts = parsed.posts.map((p) => {
    const names = Object.values(p.days).flat();
    return {
      ...p,
      placeholders: names.filter(isPlaceholderName),
      unmatched: names.filter((n) => !isPlaceholderName(n) && !byKey.has(dutyNameKey(n))),
    };
  });
  const deputies: DutyPreview["deputies"] = {};
  for (const dow of [1, 2, 3, 4, 5]) {
    deputies[dow] = {
      file: parsed.deputies[dow] ?? [],
      roster: roster
        .filter((r) => r.dayOfWeek === dow)
        .map((r) => r.staffProfile.user?.name ?? r.staffProfile.scheduleName ?? "—"),
    };
  }

  return {
    ok: parsed.posts.length > 0,
    error: parsed.posts.length === 0 ? parsed.warnings[0] : undefined,
    sheetNames: wb.SheetNames,
    sheet,
    posts,
    deputies,
    warnings: parsed.warnings,
    assignments: posts.reduce((n, p) => n + Object.values(p.days).flat().length, 0),
    payload: JSON.stringify(parsed.posts),
  };
}

const PayloadSchema = z
  .array(
    z.object({
      code: z.string().min(1).max(50),
      name: z.string().min(1).max(300),
      days: z.record(z.string(), z.array(z.string().min(1).max(120)).max(20)),
    }),
  )
  .min(1)
  .max(200);

export interface DutyApplyResult {
  ok: boolean;
  error?: string;
  posts: number;
  assignments: number;
  linked: number;
}

/** Step 2: replace the posts and the weekly programme with the previewed file. */
export async function applyDutyImport(payload: string): Promise<DutyApplyResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) return { ok: false, error: "Χωρίς εξουσιοδότηση", posts: 0, assignments: 0, linked: 0 };

  let posts: z.infer<typeof PayloadSchema>;
  try {
    posts = PayloadSchema.parse(JSON.parse(payload));
  } catch {
    return { ok: false, error: "Μη έγκυρα δεδομένα εισαγωγής — ξαναφορτώστε το αρχείο.", posts: 0, assignments: 0, linked: 0 };
  }
  const byKey = await staffByDutyKey();

  const rows = posts.flatMap((p, order) =>
    [1, 2, 3, 4, 5].flatMap((dow) =>
      (p.days[String(dow)] ?? []).map((teacherName) => ({
        code: p.code,
        dayOfWeek: dow,
        teacherName,
        staffProfileId: isPlaceholderName(teacherName) ? null : byKey.get(dutyNameKey(teacherName)) ?? null,
        order,
      })),
    ),
  );

  await db.$transaction(async (tx) => {
    await tx.dutyPost.deleteMany({}); // assignments cascade
    for (const [order, p] of posts.entries()) {
      await tx.dutyPost.create({
        data: {
          code: p.code,
          name: p.name,
          order,
          assignments: {
            create: rows
              .filter((r) => r.code === p.code)
              .map((r) => ({ dayOfWeek: r.dayOfWeek, teacherName: r.teacherName, staffProfileId: r.staffProfileId })),
          },
        },
      });
    }
  });

  const linked = rows.filter((r) => r.staffProfileId).length;
  await writeAudit({
    userId: auth.userId,
    action: "breakDuty.import",
    resource: "DutyPost",
    details: { posts: posts.length, assignments: rows.length, linked },
    ...(await requestMeta()),
  });
  revalidatePath("/[locale]/admin/settings", "page");
  return { ok: true, posts: posts.length, assignments: rows.length, linked };
}
