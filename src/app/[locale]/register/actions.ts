"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "@/server/db";
import { rateLimit } from "@/server/rateLimit";
import { composeFullName } from "@/lib/profile";
import { SELF_REGISTER_EDUCATOR_ROLES } from "@/lib/rbac";
import type { Role } from "@/generated/prisma";

// Educators (teacher / deputy heads / headmaster) claim a timetable name;
// office & chaperone just register for approval without a claim.
const CLAIMABLE_ROLES: Role[] = [...SELF_REGISTER_EDUCATOR_ROLES, "SCHOOL_ADMIN", "CHAPERONE"];
const MIN_PASSWORD_LENGTH = 8;

export async function registerAction(formData: FormData) {
  const firstName = ((formData.get("firstName") as string) ?? "").trim();
  const lastName = ((formData.get("lastName") as string) ?? "").trim();
  const name = composeFullName(firstName, lastName);
  const email = ((formData.get("email") as string) ?? "").toLowerCase().trim();
  const password = (formData.get("password") as string) ?? "";
  const confirm = (formData.get("confirmPassword") as string) ?? "";
  const role = (formData.get("role") as Role) ?? "";
  const staffName = ((formData.get("staffName") as string) ?? "").trim();
  const locale = ((formData.get("locale") as string) ?? "el");

  const base = `/${locale}/register`;

  // Throttle registrations per client IP to curb spam / enumeration.
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
  if (!rateLimit(`register:${ip}`, 5, 60 * 60 * 1000)) {
    redirect(`${base}?error=errorGeneric`);
  }

  if (!firstName || !lastName || !email || !password) redirect(`${base}?error=errorGeneric`);
  if (password.length < MIN_PASSWORD_LENGTH) redirect(`${base}?error=errorPasswordWeak`);
  if (password !== confirm) redirect(`${base}?error=errorPasswordMismatch`);
  if (!CLAIMABLE_ROLES.includes(role)) redirect(`${base}?error=errorInvalidRole`);

  const claimsTimetableName = SELF_REGISTER_EDUCATOR_ROLES.includes(role);
  if (claimsTimetableName) {
    if (!staffName) redirect(`${base}?error=errorStaffNameRequired`);
    // Verify the name exists in the timetable and hasn't been claimed
    const slot = await db.timetableSlot.findFirst({
      where: { staffName, staffId: null },
    });
    if (!slot) redirect(`${base}?error=errorStaffNameNotFound`);
    const existing = await db.teacherClaim.findFirst({
      where: { staffName, status: { not: "REJECTED" } },
    });
    if (existing) redirect(`${base}?error=errorStaffNameTaken`);
  }

  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) redirect(`${base}?error=errorEmailExists`);

  const passwordHash = await bcrypt.hash(password, 12);

  if (claimsTimetableName) {
    await db.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { firstName, lastName, name, email, passwordHash, role, isActive: false },
      });
      await tx.teacherClaim.create({
        data: { userId: user.id, staffName },
      });
    });
  } else {
    await db.user.create({
      data: { firstName, lastName, name, email, passwordHash, role, isActive: false },
    });
  }

  redirect(`${base}?success=1`);
}
