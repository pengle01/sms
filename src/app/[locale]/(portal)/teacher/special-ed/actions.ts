"use server";

import * as XLSX from "xlsx";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { canViewSpecialEdFull, specialEdCodesSeeded, stripGreekAccents } from "@/lib/specialEd";
import { teacherUserIdsForStudent } from "@/server/specialEd";
import { writeAudit, requestMeta } from "@/server/audit";

// Full special-ed access (deputy / counselor / headmaster / super-admin). Every
// mutation in here is gated on this — the session decides, never the client.
async function requireFullAccess() {
  const auth = await getActiveAuth();
  if (!auth) redirect("/");
  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: { specialEducation: true },
  });
  if (!canViewSpecialEdFull(auth.roles, !!staff?.specialEducation)) redirect("/");
  return auth;
}

export type UpdateResult = { ok: true } | { ok: false; error: string };

export async function updateSpecialEdRecord(input: {
  studentId: string;
  problemCodes: string[];
  accommodationCodes: string[];
  fileNo: string;
  remarks: string;
  frenchExempt: boolean;
  otherExemptions: string;
}): Promise<UpdateResult> {
  const auth = await requireFullAccess();

  const student = await db.studentProfile.findUnique({
    where: { id: input.studentId },
    select: { id: true, user: { select: { name: true } } },
  });
  if (!student) return { ok: false, error: "Ο μαθητής δεν βρέθηκε." };

  const fileNo = input.fileNo.trim() || null;
  const remarks = input.remarks.trim() || null;
  const otherExemptions = input.otherExemptions.trim() || null;

  // Connect only codes that actually exist in the catalog. A code not in the
  // lookup (e.g. an unseeded install, or a code removed after the form loaded)
  // would make Prisma's nested connect throw P2025 and silently fail the save —
  // so filter to known codes and report any we had to drop.
  const [knownProblems, knownAccoms] = await Promise.all([
    db.specialEdProblemCode.findMany({ where: { code: { in: input.problemCodes } }, select: { code: true } }),
    db.specialEdAccommodation.findMany({ where: { code: { in: input.accommodationCodes } }, select: { code: true } }),
  ]);
  const problemSet = new Set(knownProblems.map((p) => p.code));
  const accomSet = new Set(knownAccoms.map((a) => a.code));
  const unknown = [
    ...input.problemCodes.filter((c) => !problemSet.has(c)),
    ...input.accommodationCodes.filter((c) => !accomSet.has(c)),
  ];
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `Άγνωστοι κωδικοί: ${unknown.join(", ")}. Ελέγξτε ότι έχουν αρχικοποιηθεί οι κωδικοί ειδικής αγωγής.`,
    };
  }
  const problems = [...problemSet].map((code) => ({ code }));
  const accommodations = [...accomSet].map((code) => ({ code }));

  try {
    await db.specialEdRecord.upsert({
      where: { studentId: input.studentId },
      create: {
        studentId: input.studentId,
        fileNo,
        remarks,
        frenchExempt: input.frenchExempt,
        otherExemptions,
        problems: { connect: problems },
        accommodations: { connect: accommodations },
      },
      update: {
        fileNo,
        remarks,
        frenchExempt: input.frenchExempt,
        otherExemptions,
        problems: { set: problems },
        accommodations: { set: accommodations },
      },
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Η αποθήκευση απέτυχε." };
  }

  const meta = await requestMeta();
  await writeAudit({
    userId: auth.userId,
    action: "specialEd.update",
    resource: "StudentProfile",
    resourceId: input.studentId,
    ...meta,
  });

  // Notify the teachers who teach this student (the audience of the special-ed
  // tab — no new disclosure) that the record changed. Best-effort: a failure
  // here must not fail the save.
  try {
    const recipientIds = (await teacherUserIdsForStudent(input.studentId)).filter(
      (id) => id !== auth.userId,
    );
    if (recipientIds.length > 0) {
      const editor = await db.user.findUnique({
        where: { id: auth.userId },
        select: { name: true, staffProfile: { select: { scheduleName: true } } },
      });
      const signature = editor?.staffProfile?.scheduleName ?? editor?.name ?? "";
      const name = student.user?.name ?? "";
      const body =
        (name
          ? `Ενημερώθηκαν τα στοιχεία ειδικής αγωγής του/της ${name}.`
          : "Ενημερώθηκαν στοιχεία ειδικής αγωγής μαθητή/τριας.") +
        (signature ? `\n— ${signature}` : "");
      await db.notification.createMany({
        data: recipientIds.map((uid) => ({
          userId: uid,
          senderId: auth.userId,
          type: "SPECIAL_ED_UPDATE",
          title: "Ενημέρωση στοιχείων ειδικής αγωγής",
          body,
          linkUrl: "/teacher/special-ed",
          read: false,
        })),
      });
    }
  } catch {
    // notification is best-effort; the record was already saved
  }

  revalidatePath("/[locale]/(portal)/teacher/special-ed", "page");
  return { ok: true };
}

export async function removeSpecialEdRecord(studentId: string): Promise<UpdateResult> {
  const auth = await requireFullAccess();
  await db.specialEdRecord.deleteMany({ where: { studentId } });
  const meta = await requestMeta();
  await writeAudit({ userId: auth.userId, action: "specialEd.remove", resource: "StudentProfile", resourceId: studentId, ...meta });
  revalidatePath("/[locale]/(portal)/teacher/special-ed", "page");
  return { ok: true };
}

// ── Excel import ────────────────────────────────────────────────────────────

export type ImportResult =
  | { ok: false; error: string }
  | {
      ok: true;
      processed: number;
      created: number;
      updated: number;
      unmatched: string[]; // registry numbers with no student
      unknownCodes: string[]; // problem codes not in the lookup
    };

const norm = (v: unknown) => String(v ?? "").trim();
const truthy = (v: unknown) => {
  const s = norm(v).toLowerCase();
  return s !== "" && s !== "0" && s !== "όχι" && s !== "no" && s !== "false";
};

export async function importSpecialEd(_prev: ImportResult | null, formData: FormData): Promise<ImportResult> {
  const auth = await requireFullAccess();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Επιλέξτε ένα αρχείο Excel." };

  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  // Prefer a sheet that looks like the special-ed roster.
  const sheetName = wb.SheetNames.find((n) => /αγωγ|ειδικ|καταλογ/i.test(n)) ?? wb.SheetNames[0]!;
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName]!, { defval: "" });
  if (rows.length === 0) return { ok: false, error: "Το φύλλο δεν περιέχει γραμμές." };

  // Resolve columns by header pattern. Match accent-insensitively — ministry
  // headers carry a tonos ("Διευκόλυνση") that a plain-vowel pattern would miss.
  const headers = Object.keys(rows[0]!);
  const find = (re: RegExp) => headers.filter((h) => re.test(stripGreekAccents(h)));
  const regCol = find(/μητρ/i)[0];
  if (!regCol) return { ok: false, error: "Δεν βρέθηκε στήλη «Αρ. Μητρ.»." };
  const problemCols = find(/κωδικ.*προβλ/i);
  const accomCols = find(/διευκολ/i);
  const remarksCol = find(/παρατηρ/i)[0];
  const frenchCol = find(/γαλλικ/i)[0];
  const otherExemptCol = find(/αλλες\s*απαλλ/i)[0];

  // Known codes (so we only connect valid ones; collect the rest for reporting).
  const [knownProblems, knownAccoms] = await Promise.all([
    db.specialEdProblemCode.findMany({ select: { code: true } }),
    db.specialEdAccommodation.findMany({ select: { code: true } }),
  ]);
  const problemSet = new Set(knownProblems.map((p) => p.code));
  const accomSet = new Set(knownAccoms.map((a) => a.code));

  // Unseeded install: the lookup tables are empty, so every code would be
  // dropped as "unknown" and we'd import code-less records. Refuse loudly.
  if (!specialEdCodesSeeded(problemSet.size, accomSet.size)) {
    return {
      ok: false,
      error:
        "Οι κωδικοί ειδικής αγωγής (Προβλημάτων & Διευκολύνσεων) δεν έχουν αρχικοποιηθεί. Επικοινωνήστε με τον διαχειριστή πριν την εισαγωγή.",
    };
  }

  let created = 0;
  let updated = 0;
  const unmatched: string[] = [];
  const unknownCodes = new Set<string>();

  for (const row of rows) {
    const regNo = norm(row[regCol]);
    if (!regNo) continue;
    const student = await db.studentProfile.findUnique({ where: { studentId: regNo }, select: { id: true } });
    if (!student) {
      unmatched.push(regNo);
      continue;
    }

    const problemCodes: string[] = [];
    for (const c of problemCols) {
      const code = norm(row[c]);
      if (!code) continue;
      if (problemSet.has(code)) problemCodes.push(code);
      else unknownCodes.add(code);
    }
    const accommodationCodes: string[] = [];
    for (const c of accomCols) {
      const code = norm(row[c]);
      if (!code) continue;
      if (accomSet.has(code)) accommodationCodes.push(code);
      else unknownCodes.add(code);
    }

    const data = {
      remarks: remarksCol ? norm(row[remarksCol]) || null : null,
      frenchExempt: frenchCol ? truthy(row[frenchCol]) : false,
      otherExemptions: otherExemptCol ? norm(row[otherExemptCol]) || null : null,
    };

    const existing = await db.specialEdRecord.findUnique({ where: { studentId: student.id }, select: { id: true } });
    await db.specialEdRecord.upsert({
      where: { studentId: student.id },
      create: {
        studentId: student.id,
        ...data,
        problems: { connect: problemCodes.map((code) => ({ code })) },
        accommodations: { connect: accommodationCodes.map((code) => ({ code })) },
      },
      update: {
        ...data,
        problems: { set: problemCodes.map((code) => ({ code })) },
        accommodations: { set: accommodationCodes.map((code) => ({ code })) },
      },
    });
    if (existing) updated++;
    else created++;
  }

  const meta = await requestMeta();
  await writeAudit({
    userId: auth.userId,
    action: "specialEd.import",
    resource: "SpecialEdRecord",
    details: { created, updated, unmatched: unmatched.length },
    ...meta,
  });

  revalidatePath("/[locale]/(portal)/teacher/special-ed", "page");
  return { ok: true, processed: created + updated, created, updated, unmatched, unknownCodes: [...unknownCodes] };
}
