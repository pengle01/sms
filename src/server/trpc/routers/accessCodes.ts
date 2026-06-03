import { z } from "zod";
import { createTRPCRouter, staffProcedure, adminProcedure } from "../init";
import { TRPCError } from "@trpc/server";
import { canViewAccessCode } from "@/lib/rbac";
import { randomAccessCode } from "@/lib/accessCode";
import { writeAudit, requestMeta } from "@/server/audit";
import type { Role } from "@/generated/prisma";
import type { PrismaClient } from "@/generated/prisma/client";

// Loads the student's homeroom + the viewer's staff id and throws unless the
// caller is allowed to view this student's access code.
async function authorizeView(
  db: PrismaClient,
  userId: string,
  role: Role,
  studentProfileId: string
) {
  const student = await db.studentProfile.findUnique({
    where: { id: studentProfileId },
    select: {
      id: true,
      group: { select: { homeroomTeacherId: true, homeroomHeadteacherId: true } },
    },
  });
  if (!student) throw new TRPCError({ code: "NOT_FOUND" });

  const viewerStaff = await db.staffProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!canViewAccessCode(role, viewerStaff?.id, student.group)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

// Find an unused code (collisions are astronomically unlikely; retry anyway).
async function freshCode(db: PrismaClient): Promise<string> {
  let code = randomAccessCode();
  for (let i = 0; i < 5; i++) {
    const clash = await db.studentAccessCode.findUnique({ where: { code }, select: { id: true } });
    if (!clash) break;
    code = randomAccessCode();
  }
  return code;
}

export const accessCodesRouter = createTRPCRouter({
  get: staffProcedure
    .input(z.object({ studentProfileId: z.string() }))
    .query(async ({ ctx, input }) => {
      await authorizeView(ctx.db, ctx.session.user.id, ctx.session.user.role as Role, input.studentProfileId);
      const rec = await ctx.db.studentAccessCode.findUnique({
        where: { studentProfileId: input.studentProfileId },
        select: { code: true, studentClaimedAt: true, guardianClaims: true, updatedAt: true },
      });
      return rec;
    }),

  // Create or regenerate the code (admin only). Regenerating invalidates the
  // old code and resets claim tracking.
  generate: adminProcedure
    .input(z.object({ studentProfileId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const student = await ctx.db.studentProfile.findUnique({
        where: { id: input.studentProfileId },
        select: { id: true },
      });
      if (!student) throw new TRPCError({ code: "NOT_FOUND" });

      const code = await freshCode(ctx.db);

      const rec = await ctx.db.studentAccessCode.upsert({
        where: { studentProfileId: input.studentProfileId },
        create: {
          studentProfileId: input.studentProfileId,
          code,
          createdById: ctx.session.user.id,
        },
        update: {
          code,
          studentClaimedAt: null,
          guardianClaims: 0,
          createdById: ctx.session.user.id,
        },
        select: { code: true, studentClaimedAt: true, guardianClaims: true, updatedAt: true },
      });

      const meta = await requestMeta();
      await writeAudit({
        userId: ctx.session.user.id,
        action: "accessCode.generate",
        resource: "StudentAccessCode",
        resourceId: input.studentProfileId,
        ...meta,
      });

      return rec;
    }),

  // Generate codes for every active student that doesn't have one yet
  // (admin only). Existing codes are left untouched.
  generateAll: adminProcedure.mutation(async ({ ctx }) => {
    const missing = await ctx.db.studentProfile.findMany({
      where: { accessCode: { is: null }, user: { isActive: true } },
      select: { id: true },
    });

    let created = 0;
    for (const s of missing) {
      const code = await freshCode(ctx.db);
      await ctx.db.studentAccessCode.create({
        data: { studentProfileId: s.id, code, createdById: ctx.session.user.id },
      });
      created++;
    }

    const meta = await requestMeta();
    await writeAudit({
      userId: ctx.session.user.id,
      action: "accessCode.generateAll",
      resource: "StudentAccessCode",
      resourceId: `created:${created}`,
      ...meta,
    });

    return { created };
  }),
});
