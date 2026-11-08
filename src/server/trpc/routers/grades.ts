import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";
import { isStaff, guardianSeesGrades } from "@/lib/rbac";
import { TRPCError } from "@trpc/server";
import { gradeSchoolYear } from "@/lib/grades";
import { getSchoolYear } from "@/lib/schoolConfig";
import type { Role } from "@/generated/prisma/client";

export const gradesRouter = createTRPCRouter({
  // Get grades for a student (student, parent, or teacher of the course)
  forStudent: protectedProcedure
    .input(
      z.object({
        studentId: z.string(),
        period: z.enum(["TERM1", "TERM2"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const role = ctx.session.user.role as Role;
      const userId = ctx.session.user.id;

      // Parent: must be linked to this student
      if (role === "PARENT") {
        const parent = await ctx.db.parentProfile.findUnique({
          where: { userId },
          include: { children: true },
        });
        const linked = parent?.children.some(
          (c: { studentProfileId: string }) => c.studentProfileId === input.studentId
        );
        if (!linked) throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Anyone else must be staff — chaperones never see grades.
      if (!guardianSeesGrades(role) && !ctx.effectiveRoles.some(isStaff)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Student: can only view their own grades
      if (role === "STUDENT") {
        const student = await ctx.db.studentProfile.findUnique({
          where: { userId },
        });
        if (student?.id !== input.studentId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      return ctx.db.grade.findMany({
        where: {
          studentId: input.studentId,
          schoolYear: gradeSchoolYear(await getSchoolYear()),
          ...(input.period ? { period: input.period } : {}),
        },
        include: { course: true },
        orderBy: [{ period: "asc" }, { course: { name: "asc" } }],
      });
    }),
});
