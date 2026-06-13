"use server";

import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { db } from "@/server/db";
import { rateLimit } from "@/server/rateLimit";
import { canAddGuardian, isWellFormedCode, normalizeCode, randomOtp, roleAvailability } from "@/lib/accessCode";
import { sendOtpEmail } from "@/lib/email";
import { writeAudit } from "@/server/audit";
import { logger, errInfo } from "@/server/logger";

const MIN_PASSWORD_LENGTH = 8;
const OTP_TTL_MS = 15 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Role = "student" | "guardian";

export type StartResult =
  | { ok: true; otpId: string }
  | { ok: false; error: string };

export type VerifyResult = { ok: true } | { ok: false; error: string };

export type CheckCodeResult =
  | { ok: true; student: boolean; guardian: boolean }
  | { ok: false; error: string };

/**
 * Validate an access code and report which roles it still offers, so the form
 * only lets the user pick an available role. startActivation/verifyActivation
 * re-check everything server-side regardless.
 */
export async function checkAccessCode(input: { code: string }): Promise<CheckCodeResult> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
  if (!rateLimit(`activate-check:${ip}`, 30, 60 * 60 * 1000)) return { ok: false, error: "errGeneric" };

  const code = normalizeCode(input.code);
  if (!isWellFormedCode(code)) return { ok: false, error: "errCodeInvalid" };

  const access = await db.studentAccessCode.findUnique({
    where: { code },
    select: { studentClaimedAt: true, guardianClaims: true },
  });
  if (!access) return { ok: false, error: "errCodeInvalid" };

  const avail = roleAvailability(access);
  return { ok: true, student: avail.student, guardian: avail.guardian };
}

export async function startActivation(input: {
  code: string;
  role: Role;
  name: string;
  email: string;
  password: string;
  confirm: string;
}): Promise<StartResult> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown";
  if (!rateLimit(`activate:${ip}`, 10, 60 * 60 * 1000)) return { ok: false, error: "errGeneric" };

  const code = normalizeCode(input.code);
  const email = input.email.toLowerCase().trim();
  const name = input.name.trim();

  if (input.role !== "student" && input.role !== "guardian") return { ok: false, error: "errRoleInvalid" };
  if (!EMAIL_RE.test(email)) return { ok: false, error: "errEmailRequired" };
  if (input.password.length < MIN_PASSWORD_LENGTH) return { ok: false, error: "errPasswordWeak" };
  if (input.password !== input.confirm) return { ok: false, error: "errPasswordMismatch" };

  const access = await db.studentAccessCode.findUnique({
    where: { code },
    select: { studentProfileId: true, studentClaimedAt: true, guardianClaims: true },
  });
  if (!access) return { ok: false, error: "errCodeInvalid" };

  if (input.role === "student" && access.studentClaimedAt) {
    return { ok: false, error: "errStudentClaimed" };
  }

  // Email-collision checks before we send an OTP.
  const existingUser = await db.user.findUnique({
    where: { email },
    select: {
      id: true,
      role: true,
      studentProfile: { select: { id: true } },
      parentProfile: {
        select: {
          children: {
            where: { studentProfileId: access.studentProfileId },
            select: { id: true },
          },
        },
      },
    },
  });
  if (existingUser) {
    if (input.role === "student") {
      // Only the student's own account may keep this email.
      if (existingUser.studentProfile?.id !== access.studentProfileId) {
        return { ok: false, error: "errEmailTaken" };
      }
    } else {
      // Guardians reuse an existing PARENT account; anything else is taken.
      if (existingUser.role !== "PARENT") return { ok: false, error: "errEmailTaken" };
    }
  }

  if (input.role === "guardian") {
    // Cap new guardian links; an already-linked guardian may re-activate.
    const alreadyLinked = (existingUser?.parentProfile?.children.length ?? 0) > 0;
    if (!canAddGuardian(access.guardianClaims, alreadyLinked)) {
      return { ok: false, error: "errGuardianCap" };
    }
  }

  const otp = randomOtp();
  const codeHash = await bcrypt.hash(otp, 10);
  const passwordHash = await bcrypt.hash(input.password, 12);

  const row = await db.emailOtp.create({
    data: {
      email,
      codeHash,
      purpose: input.role === "student" ? "ACTIVATE_STUDENT" : "ACTIVATE_GUARDIAN",
      studentProfileId: access.studentProfileId,
      name: name || null,
      passwordHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
    select: { id: true },
  });

  const sent = await sendOtpEmail(email, otp);
  if (!sent.success) {
    await db.emailOtp.delete({ where: { id: row.id } }).catch(() => {});
    return { ok: false, error: "errEmailSend" };
  }

  return { ok: true, otpId: row.id };
}

export async function verifyActivation(input: {
  otpId: string;
  code: string;
}): Promise<VerifyResult> {
  const row = await db.emailOtp.findUnique({ where: { id: input.otpId } });
  if (!row) return { ok: false, error: "errOtpExpired" };

  if (row.expiresAt.getTime() < Date.now() || row.attempts >= MAX_OTP_ATTEMPTS) {
    await db.emailOtp.delete({ where: { id: row.id } }).catch(() => {});
    return { ok: false, error: "errOtpExpired" };
  }

  const valid = await bcrypt.compare(input.code.trim(), row.codeHash);
  if (!valid) {
    await db.emailOtp.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    return { ok: false, error: "errOtpInvalid" };
  }

  // Re-check the access code still exists (could have been regenerated).
  const access = await db.studentAccessCode.findUnique({
    where: { studentProfileId: row.studentProfileId },
    select: { id: true, studentClaimedAt: true, guardianClaims: true },
  });
  if (!access) {
    await db.emailOtp.delete({ where: { id: row.id } }).catch(() => {});
    return { ok: false, error: "errCodeInvalid" };
  }

  let actorUserId: string | null = null;
  try {
    if (row.purpose === "ACTIVATE_STUDENT") {
      if (access.studentClaimedAt) {
        await db.emailOtp.delete({ where: { id: row.id } }).catch(() => {});
        return { ok: false, error: "errStudentClaimed" };
      }
      const student = await db.studentProfile.findUnique({
        where: { id: row.studentProfileId },
        select: { userId: true },
      });
      if (!student) return { ok: false, error: "errGeneric" };
      actorUserId = student.userId;

      // Guard against the email being taken by another account in the meantime.
      const clash = await db.user.findUnique({ where: { email: row.email }, select: { id: true } });
      if (clash && clash.id !== student.userId) return { ok: false, error: "errEmailTaken" };

      await db.$transaction([
        db.user.update({
          where: { id: student.userId },
          data: { email: row.email, passwordHash: row.passwordHash, isActive: true },
        }),
        db.studentAccessCode.update({
          where: { id: access.id },
          data: { studentClaimedAt: new Date() },
        }),
        db.emailOtp.delete({ where: { id: row.id } }),
      ]);
    } else {
      // Guardian: reuse existing PARENT user or create a new one, then link.
      const existing = await db.user.findUnique({
        where: { email: row.email },
        select: {
          id: true,
          role: true,
          parentProfile: {
            select: {
              id: true,
              children: { where: { studentProfileId: row.studentProfileId }, select: { id: true } },
            },
          },
        },
      });
      if (existing && existing.role !== "PARENT") return { ok: false, error: "errEmailTaken" };

      // Re-check the cap at claim time (the count may have grown since the
      // OTP was sent). Re-activation of an already-linked guardian is exempt
      // and never burns a slot.
      const alreadyLinked = (existing?.parentProfile?.children.length ?? 0) > 0;
      if (!canAddGuardian(access.guardianClaims, alreadyLinked)) {
        await db.emailOtp.delete({ where: { id: row.id } }).catch(() => {});
        return { ok: false, error: "errGuardianCap" };
      }

      let parentProfileId: string;
      if (existing) {
        actorUserId = existing.id;
        await db.user.update({
          where: { id: existing.id },
          data: { passwordHash: row.passwordHash, isActive: true, ...(row.name ? { name: row.name } : {}) },
        });
        parentProfileId =
          existing.parentProfile?.id ??
          (await db.parentProfile.create({
            data: { userId: existing.id, role: "GUARDIAN" },
            select: { id: true },
          })).id;
      } else {
        const profile = await db.parentProfile.create({
          data: {
            role: "GUARDIAN",
            user: { create: { email: row.email, name: row.name, role: "PARENT", passwordHash: row.passwordHash, isActive: true } },
          },
          select: { id: true, userId: true },
        });
        parentProfileId = profile.id;
        actorUserId = profile.userId;
      }

      await db.$transaction([
        db.parentStudent.upsert({
          where: {
            parentProfileId_studentProfileId: {
              parentProfileId,
              studentProfileId: row.studentProfileId,
            },
          },
          update: {},
          create: { parentProfileId, studentProfileId: row.studentProfileId },
        }),
        // Only a NEW guardian link counts toward the cap.
        ...(alreadyLinked
          ? []
          : [
              db.studentAccessCode.update({
                where: { id: access.id },
                data: { guardianClaims: { increment: 1 } },
              }),
            ]),
        db.emailOtp.delete({ where: { id: row.id } }),
      ]);
    }
  } catch (e) {
    logger.error({ event: "activate.verifyFailed", err: errInfo(e) }, "Account activation verify failed");
    return { ok: false, error: "errGeneric" };
  }

  if (actorUserId) {
    await writeAudit({
      userId: actorUserId,
      action: row.purpose === "ACTIVATE_STUDENT" ? "account.activate.student" : "account.activate.guardian",
      resource: "StudentAccessCode",
      resourceId: row.studentProfileId,
      details: { email: row.email },
    });
  }

  return { ok: true };
}
