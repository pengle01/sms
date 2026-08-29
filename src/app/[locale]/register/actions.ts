"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/server/db";
import { isStaffNameAvailable } from "@/server/staffRoster";
import { allowRegistration } from "@/server/rateLimit";
import { clientIp } from "@/server/audit";
import { logger } from "@/server/logger";
import { composeFullName } from "@/lib/profile";
import { SELF_REGISTER_EDUCATOR_ROLES } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/client";

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

  if (!firstName || !lastName || !email || !password) redirect(`${base}?error=errorGeneric`);

  // Throttled per email (tight) and per IP (wide) — a whole staff room signs up
  // from one NAT address, so the IP alone cannot carry the tight limit. Checked
  // after the required-field test so an empty form reports what is actually
  // wrong instead of silently spending someone's budget.
  const ip = (await clientIp()) ?? "unknown";
  const limit = allowRegistration(ip, email);
  if (!limit.allowed) {
    logger.warn(
      { event: "register.rateLimited", tier: limit.tier, role },
      "Registration rate-limited",
    );
    redirect(`${base}?error=errorTooMany`);
  }
  if (password.length < MIN_PASSWORD_LENGTH) redirect(`${base}?error=errorPasswordWeak`);
  if (password !== confirm) redirect(`${base}?error=errorPasswordMismatch`);
  if (!CLAIMABLE_ROLES.includes(role)) redirect(`${base}?error=errorInvalidRole`);

  const claimsTimetableName = SELF_REGISTER_EDUCATOR_ROLES.includes(role);
  if (claimsTimetableName) {
    if (!staffName) redirect(`${base}?error=errorStaffNameRequired`);
    // Same list the picker was built from, so a name can never be offered here
    // and refused there. The claim check below stays separate so "already taken"
    // reads differently from "no such name".
    if (!(await isStaffNameAvailable(staffName))) {
      redirect(`${base}?error=errorStaffNameNotFound`);
    }
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
