"use server";

import { getSuperAdminAuth } from "@/server/authz";
import { db } from "@/server/db";
import * as XLSX from "xlsx";
import { Gender, ParentRole, Role } from "@/generated/prisma/enums";
import { normalizePhone, evaluateDefaultSms, SMS_FLAG_REASON_EL } from "@/lib/smsContacts";

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
}

const COLS = {
  group:             "Τμήμα",
  grade:             "Τάξη",
  lastName:          "Επώνυμο",
  firstName:         "Όνομα",
  registryId:        "Μητρώο",
  gender:            "Φύλο",
  dob:               "Ημ/νία Γέννησης",
  placeOfBirth:      "Τόπος Γέννησης",
  nationality:       "Εθνικότητα",
  idCard:            "Αρ. Ταυτότητας",
  passport:          "Αρ. Διαβατηρίου",
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

function parseDob(val: unknown): Date | undefined {
  if (!val) return undefined;
  if (val instanceof Date) return isNaN(val.getTime()) ? undefined : val;
  const d = new Date(String(val));
  return isNaN(d.getTime()) ? undefined : d;
}

export async function importStudents(_prev: ImportResult | null, formData: FormData): Promise<ImportResult> {
  const auth = await getSuperAdminAuth();
  if (!auth) {
    return { success: false, studentsCreated: 0, studentsUpdated: 0, groupsCreated: 0, smsContactsCreated: 0, flaggedStudents: 0, flagged: [], skipped: 0, errors: ["Χωρίς εξουσιοδότηση"] };
  }

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { success: false, studentsCreated: 0, studentsUpdated: 0, groupsCreated: 0, smsContactsCreated: 0, flaggedStudents: 0, flagged: [], skipped: 0, errors: ["Δεν επιλέχθηκε αρχείο"] };
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

      const personalFields = {
        ...(groupId !== undefined ? { group: { connect: { id: groupId } } } : {}),
        gender:        parseGender(str(row, COLS.gender)),
        dateOfBirth:   parseDob(row[COLS.dob]),
        placeOfBirth:  str(row, COLS.placeOfBirth)   || undefined,
        nationality:   str(row, COLS.nationality)    || undefined,
        idCardNumber:  str(row, COLS.idCard)         || undefined,
        passportNumber:str(row, COLS.passport)       || undefined,
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

  return { success: true, studentsCreated, studentsUpdated, groupsCreated, smsContactsCreated, flaggedStudents, flagged: flaggedList, skipped, errors };
}
