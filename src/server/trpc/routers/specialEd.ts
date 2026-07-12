import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, staffProcedure } from "../init";
import type { Role } from "@/generated/prisma/client";
import { canViewSpecialEdFull } from "@/lib/specialEd";
import { teachesStudent, getSpecialEdCodes } from "@/server/specialEd";
import { writeAudit } from "@/server/audit";

export const specialEdRouter = createTRPCRouter({
  // Intentional, audited reveal of a special-ed student's CODES (problem +
  // accommodation) — for teachers who teach the student, and for full viewers.
  // Returns codes only; remarks/support are never exposed here.
  revealCodes: staffProcedure
    .input(z.object({ studentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const viewer = await ctx.db.staffProfile.findUnique({
        where: { userId: ctx.session.user.id },
        select: { id: true, specialEducation: true },
      });

      const full = canViewSpecialEdFull(ctx.effectiveRoles as Role[], !!viewer?.specialEducation);
      const teaches = !!viewer && (await teachesStudent(viewer.id, input.studentId));
      if (!full && !teaches) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const codes = await getSpecialEdCodes(input.studentId);

      await writeAudit({
        userId: ctx.session.user.id,
        action: "specialEd.reveal",
        resource: "StudentProfile",
        resourceId: input.studentId,
        details: { full, teaches },
      });

      return codes ?? { problems: [], accommodations: [] };
    }),
});
