"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { db } from "@/server/db";
import { isStaffNameAvailable } from "@/server/staffRoster";
import { allowRegistration } from "@/server/rateLimit";
import { clientIp } from "@/server/audit";
import { logger } from "@/server/logger";
import { composeFullName } from "@/lib/profile";
import { SELF_REGISTER_EDUCATOR_ROLES, REGISTRATION_ROLES } from "@/lib/rbac";
import type { Role } from "@/generated/prisma/client";
import { PASSWORD_MIN_LENGTH as MIN_PASSWORD_LENGTH } from "@/lib/password";
import { registerValues, type RegisterState } from "@/lib/registerForm";

// Educators (teacher / deputy heads / headmaster) claim a timetable name;
// office & chaperone just register for approval without a claim.
const CLAIMABLE_ROLES: Role[] = REGISTRATION_ROLES;

// Errors come back as state (with what was typed, minus the passwords) so the
// form keeps its fields; only success redirects.
export async function registerAction(_prev: RegisterState, formData: FormData): Promise<RegisterState> {
  const fail = (error: string): RegisterState => ({ error, values: registerValues(formData) });
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

  if (!firstName || !lastName || !email || !password) return fail("errorGeneric");

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
    return fail("errorTooMany");
  }
  if (password.length < MIN_PASSWORD_LENGTH) return fail("errorPasswordWeak");
  if (password !== confirm) return fail("errorPasswordMismatch");
  if (!CLAIMABLE_ROLES.includes(role)) return fail("errorInvalidRole");

  const claimsTimetableName = SELF_REGISTER_EDUCATOR_ROLES.includes(role);
  if (claimsTimetableName) {
    if (!staffName) return fail("errorStaffNameRequired");
    // Same list the picker was built from, so a name can never be offered here
    // and refused there. The claim check below stays separate so "already taken"
    // reads differently from "no such name".
    if (!(await isStaffNameAvailable(staffName))) {
      return fail("errorStaffNameNotFound");
    }
    const existing = await db.teacherClaim.findFirst({
      where: { staffName, status: { not: "REJECTED" } },
    });
    if (existing) return fail("errorStaffNameTaken");
  }

  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) return fail("errorEmailExists");

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
