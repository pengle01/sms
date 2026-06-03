import { z } from "zod";
import { createTRPCRouter, staffProcedure } from "../init";
import { TRPCError } from "@trpc/server";
import { canManageAccessCode } from "@/lib/rbac";
import { randomAccessCode } from "@/lib/accessCode";
import { writeAudit, requestMeta } from "@/server/audit";
import type { Role } from "@/generated/prisma";
import type { PrismaClient } from "@/generated/prisma/client";

// Loads the student's homeroom + the viewer's staff id and throws unless the
// caller is allowed to manage this student's access code.
async function authorize(
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

  if (!canManageAccessCode(role, viewerStaff?.id, student.group)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
}

export const accessCodesRouter = createTRPCRouter({
  get: staffProcedure
    .input(z.object({ studentProfileId: z.string() }))
    .query(async ({ ctx, input }) => {
      await authorize(ctx.db, ctx.session.user.id, ctx.session.user.role as Role, input.studentProfileId);
      const rec = await ctx.db.studentAccessCode.findUnique({
        where: { studentProfileId: input.studentProfileId },
        select: { code: true, studentClaimedAt: true, guardianClaims: true, updatedAt: true },
      });
      return rec;
    }),

  // Create or regenerate the code. Regenerating invalidates the old code and
  // resets claim tracking.
  generate: staffProcedure
    .input(z.object({ studentProfileId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await authorize(ctx.db, ctx.session.user.id, ctx.session.user.role as Role, input.studentProfileId);

      // Find an unused code (collisions are astronomically unlikely; retry anyway).
      let code = randomAccessCode();
      for (let i = 0; i < 5; i++) {
        const clash = await ctx.db.studentAccessCode.findUnique({ where: { code }, select: { id: true } });
        if (!clash) break;
        code = randomAccessCode();
      }

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
});
