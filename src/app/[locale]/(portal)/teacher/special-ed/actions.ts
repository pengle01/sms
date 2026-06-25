"use server";

import * as XLSX from "xlsx";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { canViewSpecialEdFull } from "@/lib/specialEd";
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
  const problems = input.problemCodes.map((code) => ({ code }));
  const accommodations = input.accommodationCodes.map((code) => ({ code }));

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

  // Resolve columns by header pattern.
  const headers = Object.keys(rows[0]!);
  const find = (re: RegExp) => headers.filter((h) => re.test(h));
  const regCol = find(/μητρ/i)[0];
  if (!regCol) return { ok: false, error: "Δεν βρέθηκε στήλη «Αρ. Μητρ.»." };
  const problemCols = find(/κωδικ.*προβλ/i);
  const accomCols = find(/διευκολ/i);
  const remarksCol = find(/παρατηρ/i)[0];
  const frenchCol = find(/γαλλικ/i)[0];
  const otherExemptCol = find(/άλλες\s*απαλλ|αλλες\s*απαλλ/i)[0];

  // Known codes (so we only connect valid ones; collect the rest for reporting).
  const [knownProblems, knownAccoms] = await Promise.all([
    db.specialEdProblemCode.findMany({ select: { code: true } }),
    db.specialEdAccommodation.findMany({ select: { code: true } }),
  ]);
  const problemSet = new Set(knownProblems.map((p) => p.code));
  const accomSet = new Set(knownAccoms.map((a) => a.code));

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
