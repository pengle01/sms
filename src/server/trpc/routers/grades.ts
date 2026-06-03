import { z } from "zod";
import { createTRPCRouter, staffProcedure, protectedProcedure } from "../init";
import { TRPCError } from "@trpc/server";
import type { Role } from "@/generated/prisma";

export const gradesRouter = createTRPCRouter({
  // Enter or update a grade (teacher only — their assigned courses)
  upsert: staffProcedure
    .input(
      z.object({
        studentId: z.string(),
        courseId: z.string(),
        period: z.enum(["TERM1", "TERM2"]),
        value: z.number().min(0).max(20),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const staff = await ctx.db.staffProfile.findUnique({
        where: { userId: ctx.session.user.id },
      });
      if (!staff) throw new TRPCError({ code: "NOT_FOUND" });

      // Verify teacher is assigned to this course (unless management)
      const role = ctx.session.user.role as Role;
      if (role === "TEACHER") {
        const assignment = await ctx.db.courseAssignment.findFirst({
          where: { courseId: input.courseId, staffId: staff.id },
        });
        if (!assignment) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Not assigned to this course" });
        }
      }

      return ctx.db.grade.upsert({
        where: {
          studentId_courseId_period: {
            studentId: input.studentId,
            courseId: input.courseId,
            period: input.period,
          },
        },
        create: {
          studentId: input.studentId,
          courseId: input.courseId,
          staffId: staff.id,
          period: input.period,
          value: input.value,
          notes: input.notes,
        },
        update: {
          value: input.value,
          notes: input.notes,
          staffId: staff.id,
        },
      });
    }),

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
          ...(input.period ? { period: input.period } : {}),
        },
        include: { course: true },
        orderBy: [{ period: "asc" }, { course: { name: "asc" } }],
      });
    }),
});
