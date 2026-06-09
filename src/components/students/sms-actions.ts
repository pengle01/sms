"use server";

import { db } from "@/server/db";
import { revalidatePath } from "next/cache";
import { getActiveAuth } from "@/server/authz";
import { isOfficeAdmin, isAdminStaff } from "@/lib/rbac";
import { ParentRole } from "@/generated/prisma/enums";

const ROLES = ["FATHER", "MOTHER", "GUARDIAN", "OTHER"];

// SMS-recipient management is available to the office and to system admins.
async function authorize() {
  const auth = await getActiveAuth();
  if (!auth || !auth.roles.some((r) => isOfficeAdmin(r) || isAdminStaff(r))) return null;
  return auth;
}

// Add another SMS recipient for a student.
export async function addSmsRecipient(formData: FormData) {
  if (!(await authorize())) return;
  const studentId = formData.get("studentId") as string;
  const name = ((formData.get("name") as string) ?? "").trim();
  const phone = ((formData.get("phone") as string) ?? "").trim();
  const roleRaw = ((formData.get("role") as string) ?? "OTHER").toUpperCase();
  if (!studentId || !name || !phone) return;
  const role = (ROLES.includes(roleRaw) ? roleRaw : "OTHER") as ParentRole;

  await db.smsContact.create({ data: { studentId, name, phone, role, active: true } });
  revalidatePath("/", "layout");
}

// Make a recipient the default for the student. Choosing one by hand resolves
// the import flag (the office has confirmed the recipient).
export async function setDefaultSmsRecipient(formData: FormData) {
  if (!(await authorize())) return;
  const studentId = formData.get("studentId") as string;
  const contactId = formData.get("contactId") as string;
  if (!studentId || !contactId) return;

  await db.$transaction([
    db.smsContact.updateMany({ where: { studentId, isDefault: true }, data: { isDefault: false } }),
    db.smsContact.update({ where: { id: contactId }, data: { isDefault: true, active: true } }),
    db.studentProfile.update({ where: { id: studentId }, data: { smsFlagged: false, smsFlagReason: null } }),
  ]);
  revalidatePath("/", "layout");
}

// Flip a recipient's active state. Toggles from the current DB value so it can
// never be inverted by a stale page render.
export async function toggleSmsRecipientActive(formData: FormData) {
  if (!(await authorize())) return;
  const contactId = formData.get("contactId") as string;
  if (!contactId) return;
  const contact = await db.smsContact.findUnique({ where: { id: contactId }, select: { active: true } });
  if (!contact) return;
  await db.smsContact.update({ where: { id: contactId }, data: { active: !contact.active } });
  revalidatePath("/", "layout");
}
