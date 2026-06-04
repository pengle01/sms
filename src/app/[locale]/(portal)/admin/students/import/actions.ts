"use server";

import { getSuperAdminAuth } from "@/server/authz";
import { db } from "@/server/db";
import * as XLSX from "xlsx";
import { Gender, ParentRole, Role } from "@/generated/prisma/enums";

export interface ImportResult {
  success: boolean;
  studentsCreated: number;
  studentsUpdated: number;
  groupsCreated: number;
  parentsCreated: number;
  smsContactsCreated: number;
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
    return { success: false, studentsCreated: 0, studentsUpdated: 0, groupsCreated: 0, parentsCreated: 0, smsContactsCreated: 0, skipped: 0, errors: ["Unauthorized"] };
  }

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    return { success: false, studentsCreated: 0, studentsUpdated: 0, groupsCreated: 0, parentsCreated: 0, smsContactsCreated: 0, skipped: 0, errors: ["No file provided"] };
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]!];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet!, { defval: "" });

  let studentsCreated = 0;
  let studentsUpdated = 0;
  let groupsCreated = 0;
  let parentsCreated = 0;
  let smsContactsCreated = 0;
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
    const rowLabel = `Row ${rowIndex + 2} (${registryId})`;

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

      // ── Parents + SMS contacts ──────────────────────────────────────────
      const usedPhones = new Set<string>();

      async function upsertParent(
        pLastName: string, pFirstName: string,
        pEmail: string,    pPhone: string,
        role: ParentRole,
      ) {
        const pName = [pLastName, pFirstName].filter(Boolean).join(" ");
        if (!pName) return;

        const phone = pPhone || undefined;

        // Resolve email: if the provided address is already taken by a non-parent
        // user (e.g. the same address appears in the student column), fall back to
        // a per-student placeholder so we never collide on User.email.
        let email = (pEmail || "").toLowerCase();
        if (email) {
          const takenBy = await db.user.findUnique({
            where: { email },
            select: { id: true, parentProfile: { select: { id: true } } },
          });
          if (takenBy && !takenBy.parentProfile) {
            // Email belongs to a non-parent user — use placeholder instead
            email = "";
          }
        }
        if (!email) email = `p.${registryId}.${role.toLowerCase()}@pending.sms`;

        // Find existing parent profile via User.email
        const existingUser = await db.user.findUnique({
          where: { email },
          select: { id: true, parentProfile: { select: { id: true } } },
        });

        let parentProfile: { id: string };

        if (existingUser?.parentProfile) {
          parentProfile = existingUser.parentProfile;
        } else {
          parentProfile = await db.parentProfile.create({
            data: {
              role,
              phone,
              user: { create: { email, name: pName, role: Role.PARENT, isActive: true } },
            },
            select: { id: true },
          });
          parentsCreated++;
        }

        await db.parentStudent.upsert({
          where: {
            parentProfileId_studentProfileId: {
              parentProfileId:  parentProfile.id,
              studentProfileId: studentId2,
            },
          },
          create: { parentProfileId: parentProfile.id, studentProfileId: studentId2 },
          update: {},
        });

        if (phone && !usedPhones.has(phone)) {
          usedPhones.add(phone);
          const exists = await db.smsContact.findFirst({ where: { studentId: studentId2, phone } });
          if (!exists) {
            await db.smsContact.create({
              data: { studentId: studentId2, name: pName, phone, role, active: true, parentProfileId: parentProfile.id },
            });
            smsContactsCreated++;
          }
        }
      }

      await upsertParent(
        str(row, COLS.fatherLastName), str(row, COLS.fatherFirstName),
        str(row, COLS.fatherEmail),    str(row, COLS.fatherPhone),
        ParentRole.FATHER,
      );
      await upsertParent(
        str(row, COLS.motherLastName), str(row, COLS.motherFirstName),
        str(row, COLS.motherEmail),    str(row, COLS.motherPhone),
        ParentRole.MOTHER,
      );

      const guardianName = [str(row, COLS.guardianLastName), str(row, COLS.guardianFirstName)].filter(Boolean).join(" ");
      if (guardianName) {
        await upsertParent(
          str(row, COLS.guardianLastName), str(row, COLS.guardianFirstName),
          "",                              str(row, COLS.homePhone),
          ParentRole.GUARDIAN,
        );
      }

      // Extra dedicated SMS number
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
    } catch (err) {
      errors.push(`${rowLabel}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { success: true, studentsCreated, studentsUpdated, groupsCreated, parentsCreated, smsContactsCreated, skipped, errors };
}
