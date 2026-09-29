"use server";

import { getSuperAdminAuth } from "@/server/authz";
import { db } from "@/server/db";
import * as XLSX from "xlsx";
import { Gender, ParentRole, Role } from "@/generated/prisma/enums";
import { normalizePhone, evaluateDefaultSms, SMS_FLAG_REASON_EL } from "@/lib/smsContacts";
import { revalidatePath } from "next/cache";
import { writeAudit, requestMeta } from "@/server/audit";
import { normRegistry } from "@/lib/studentImportSync";
import {
  findMissingStudents,
  countActiveStudents,
  deactivateStudents,
  reactivateImportedStudents,
  type MissingStudent,
} from "@/server/studentImportSync";

export interface ImportResult {
  success: boolean;
  studentsCreated: number;
  studentsUpdated: number;
  groupsCreated: number;
  smsContactsCreated: number;
  flaggedStudents: number;
  flagged: { studentId: string; name: string; reason: string }[];
  skipped: number;
  errors: string[];
  /** Students the import had deactivated earlier, back in the file and so reactivated. */
  studentsReactivated: number;
  /** Active students not in this file — shown for the admin to confirm their deactivation. */
  missing: MissingStudent[];
  /** Distinct students in the file, and active students after the import (partial-file warning). */
  fileCount: number;
  activeCount: number;
}

const EMPTY = { studentsCreated: 0, studentsUpdated: 0, groupsCreated: 0, smsContactsCreated: 0, flaggedStudents: 0, flagged: [], skipped: 0, studentsReactivated: 0, missing: [], fileCount: 0, activeCount: 0 };

const COLS = {
  group:             "Τμήμα",
  grade:             "Τάξη",
  lastName:          "Επώνυμο",
  firstName:         "Όνομα",
  registryId:        "Μητρώο",
  gender:            "Φύλο",
  studentEmail:      "e-Mail (1) - Μαθητή",
  fatherLastName:    "Επώνυμο Πατέρα",
  fatherFirstName:   "Όνομα Πατέρα",
  fatherPhone:       "Κινητό (2) - Πατέρα",
  fatherEmail:       "e-Mail (2) - Πατέρα",
  motherLastName:    "Επώνυμο Μητέρας",
  motherFirstName:   "Όνομα Μητέρας",
  motherPhone:       "Κινητό (3) - Μητέρας",
  motherEmail:       "e-Mail (3) - Μητέρας",
  guardianLastName:  "Επώνυμο Κηδεμόνα",
  guardianFirstName: "Όνομα Κηδεμόνα",
  homePhone:         "Τηλέφωνο (1)",
  smsPhone:          "τηλέφωνο SMS",
} as const;

function str(row: Record<string, unknown>, col: string): string {
  const v = row[col];
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

function gradeFromCode(code: string): number {
  const c = code.toUpperCase();
  if (c.startsWith("Β") || c.startsWith("B")) return 2;
  if (c.startsWith("Γ") || c.startsWith("G") || c.startsWith("C")) return 3;
  return 1;
}

function parseGender(val: string): Gender | undefined {
  const v = val.toUpperCase();
  if (v === "Α" || v === "ΑΡΡΕΝ" || v === "M" || v === "MALE") return Gender.MALE;
  if (v === "Θ" || v === "ΘΗΛΥ" || v === "F" || v === "FEMALE") return Gender.FEMALE;
  return undefined;
}

export async function importStudents(_prev: ImportResult | null, formData: FormData): Promise<ImportResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) {
    return { success: false, ...EMPTY, errors: ["Χωρίς εξουσιοδότηση"] };
  }

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { success: false, ...EMPTY, errors: ["Δεν επιλέχθηκε αρχείο"] };
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]!];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet!, { defval: "" });

  let studentsCreated = 0;
  let studentsUpdated = 0;
  let groupsCreated = 0;
  let smsContactsCreated = 0;
  let flaggedStudents = 0;
  const flaggedList: { studentId: string; name: string; reason: string }[] = [];
  let skipped = 0;
  const errors: string[] = [];

  const groupCache = new Map<string, string>();
  // Every registry number in the file — students not among them are offered for
  // deactivation. Collected before any write, so a row that fails still counts
  // as present (its student must not be offered for removal).
  const fileRegistries = new Set<string>();
  for (const row of rows) {
    const reg = normRegistry(row[COLS.registryId]);
    if (reg) fileRegistries.add(reg);
  }
  const presentProfileIds: string[] = [];

  for (const [rowIndex, row] of rows.entries()) {
    const groupName  = str(row, COLS.group);
    const gradeCode  = str(row, COLS.grade);
    const lastName   = str(row, COLS.lastName);
    const firstName  = str(row, COLS.firstName);
    const registryId = str(row, COLS.registryId);

    if (!registryId || (!lastName && !firstName)) {
      skipped++;
      continue;
    }

    const fullName = [lastName, firstName].filter(Boolean).join(" ");
    const rowLabel = `Γραμμή ${rowIndex + 2} (${registryId})`;

    try {
      // ── Group ───────────────────────────────────────────────────────────
      let groupId: string | undefined;
      if (groupName) {
        let cached = groupCache.get(groupName);
        if (!cached) {
          const grade = gradeFromCode(gradeCode);
          const group = await db.group.upsert({
            where: { name: groupName },
            create: { name: groupName, grade },
            update: {},
            select: { id: true, _count: { select: { students: true } } },
          });
          // Detect if it was just created (no students yet and we're first)
          cached = group.id;
          groupCache.set(groupName, cached);
          if (group._count.students === 0) groupsCreated++;
        }
        groupId = cached;
      }

      // ── Student ─────────────────────────────────────────────────────────
      // Use spreadsheet email only if not already taken by another user.
      const rawStudentEmail = str(row, COLS.studentEmail).toLowerCase();
      const placeholder     = `s.${registryId}@pending.sms`;
      let   studentEmail    = rawStudentEmail || placeholder;

      const existing = await db.studentProfile.findUnique({ where: { studentId: registryId }, select: { id: true, userId: true } });

      if (!existing && rawStudentEmail) {
        const taken = await db.user.findUnique({ where: { email: rawStudentEmail }, select: { id: true } });
        if (taken) studentEmail = placeholder;
      }

      // Identity documents, birth details and nationality are deliberately NOT
      // imported — the app has no use for them (GDPR data minimisation), and
      // any such columns still present in the spreadsheet are ignored.
      const personalFields = {
        ...(groupId !== undefined ? { group: { connect: { id: groupId } } } : {}),
        gender:        parseGender(str(row, COLS.gender)),
      };

      if (existing) {
        await db.studentProfile.update({
          where: { studentId: registryId },
          data: { ...personalFields, user: { update: { name: fullName } } },
        });
        studentsUpdated++;
      } else {
        await db.studentProfile.create({
          data: {
            studentId: registryId,
            ...personalFields,
            user: {
              create: {
                email:    studentEmail,
                name:     fullName,
                role:     Role.STUDENT,
                isActive: true,
              },
            },
          },
        });
        studentsCreated++;
      }

      const student = await db.studentProfile.findUnique({ where: { studentId: registryId }, select: { id: true } });
      if (!student) continue;
      const studentId2 = student.id;
      presentProfileIds.push(studentId2);

      // ── Parent SMS contacts ─────────────────────────────────────────────
      // Parents are NOT given login accounts at import. A parent account
      // (ParentProfile + User + the student link) is created ONLY when the
      // parent activates with the access code given to them (see
      // activate/actions.ts). Here we just record their phone as an SMS contact
      // (name + role) so messaging works before they have claimed an account.
      const usedPhones = new Set<string>();

      async function addParentContact(
        pLastName: string, pFirstName: string,
        pPhone: string,    role: ParentRole,
      ) {
        const pName = [pLastName, pFirstName].filter(Boolean).join(" ");
        const phone = pPhone.trim();
        if (!pName || !phone || usedPhones.has(phone)) return;
        usedPhones.add(phone);
        const exists = await db.smsContact.findFirst({ where: { studentId: studentId2, phone } });
        if (!exists) {
          await db.smsContact.create({
            data: { studentId: studentId2, name: pName, phone, role, active: true },
          });
          smsContactsCreated++;
        }
      }

      await addParentContact(
        str(row, COLS.fatherLastName), str(row, COLS.fatherFirstName),
        str(row, COLS.fatherPhone), ParentRole.FATHER,
      );
      await addParentContact(
        str(row, COLS.motherLastName), str(row, COLS.motherFirstName),
        str(row, COLS.motherPhone), ParentRole.MOTHER,
      );

      const guardianName = [str(row, COLS.guardianLastName), str(row, COLS.guardianFirstName)].filter(Boolean).join(" ");
      if (guardianName) {
        await addParentContact(
          str(row, COLS.guardianLastName), str(row, COLS.guardianFirstName),
          str(row, COLS.homePhone), ParentRole.GUARDIAN,
        );
      }

      // Dedicated SMS number from the file = the default recipient.
      const smsPhone = str(row, COLS.smsPhone);
      if (smsPhone && !usedPhones.has(smsPhone)) {
        usedPhones.add(smsPhone);
        const exists = await db.smsContact.findFirst({ where: { studentId: studentId2, phone: smsPhone } });
        if (!exists) {
          await db.smsContact.create({
            data: { studentId: studentId2, name: "SMS", phone: smsPhone, role: ParentRole.OTHER, active: true },
          });
          smsContactsCreated++;
        }
      }

      // Decide the default recipient and flag the student when the file's SMS
      // number is empty or matches no parent/guardian.
      const guardianPhone = guardianName ? str(row, COLS.homePhone) : "";
      const { flagged, reason } = evaluateDefaultSms(smsPhone, [
        str(row, COLS.fatherPhone),
        str(row, COLS.motherPhone),
        guardianPhone,
      ]);

      const normTarget = normalizePhone(smsPhone);
      const contacts = await db.smsContact.findMany({
        where: { studentId: studentId2 },
        select: { id: true, phone: true },
      });
      const match = normTarget ? contacts.find((c) => normalizePhone(c.phone) === normTarget) : undefined;

      if (match) {
        // Only the default recipient is active (receives) by default; the other
        // parents start inactive — the office activates a second for "both".
        for (const c of contacts) {
          await db.smsContact.update({
            where: { id: c.id },
            data: { isDefault: c.id === match.id, active: c.id === match.id },
          });
        }
      } else {
        // No usable default (flagged) → keep everyone active so SMS still go out.
        await db.smsContact.updateMany({
          where: { studentId: studentId2 },
          data: { isDefault: false, active: true },
        });
      }

      const reasonText = flagged && reason ? SMS_FLAG_REASON_EL[reason] : null;
      await db.studentProfile.update({
        where: { id: studentId2 },
        data: { smsFlagged: flagged, smsFlagReason: reasonText },
      });
      if (flagged) {
        flaggedStudents++;
        flaggedList.push({ studentId: registryId, name: fullName, reason: reasonText ?? "" });
      }
    } catch (err) {
      errors.push(`${rowLabel}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const studentsReactivated = await reactivateImportedStudents(presentProfileIds);
  const [missing, activeCount] = await Promise.all([findMissingStudents(fileRegistries), countActiveStudents()]);

  return {
    success: true, studentsCreated, studentsUpdated, groupsCreated, smsContactsCreated, flaggedStudents,
    flagged: flaggedList, skipped, errors,
    studentsReactivated, missing, fileCount: fileRegistries.size, activeCount,
  };
}

export type DeactivateMissingResult =
  | { ok: true; students: number; parents: number }
  | { ok: false; error: string };

/**
 * The admin confirmed the preview: deactivate the chosen students missing from
 * the file, and parents left with no active child. Deactivation keeps every
 * record and is reversible (a later import with the student brings them back).
 */
export async function deactivateMissingStudents(profileIds: string[]): Promise<DeactivateMissingResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) return { ok: false, error: "Χωρίς εξουσιοδότηση" };
  const ids = [...new Set(profileIds.filter((id) => typeof id === "string" && id))];
  if (ids.length === 0) return { ok: true, students: 0, parents: 0 };

  const { students, parentUserIds } = await deactivateStudents(ids);
  const meta = await requestMeta();
  for (const st of students) {
    await writeAudit({
      userId: auth.userId,
      action: "student.deactivate",
      resource: "StudentProfile",
      resourceId: st.id,
      details: { studentId: st.studentId, source: "import" },
      ...meta,
    });
  }
  if (parentUserIds.length > 0) {
    await writeAudit({
      userId: auth.userId,
      action: "parent.deactivate",
      resource: "User",
      details: { parentUserIds, source: "import" },
      ...meta,
    });
  }
  revalidatePath("/[locale]/(portal)/admin/students", "page");
  revalidatePath("/[locale]/(portal)/office/students", "page");
  return { ok: true, students: students.length, parents: parentUserIds.length };
}
