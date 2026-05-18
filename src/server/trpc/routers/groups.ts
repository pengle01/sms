import { z } from "zod";
import { createTRPCRouter, staffProcedure, managementProcedure } from "../init";
import { TRPCError } from "@trpc/server";

export const groupsRouter = createTRPCRouter({
  list: staffProcedure.query(({ ctx }) =>
    ctx.db.group.findMany({
      include: {
        homeroomTeacher: { include: { user: { select: { name: true } } } },
        _count: { select: { students: true } },
      },
      orderBy: [{ grade: "asc" }, { name: "asc" }],
    })
  ),

  byId: staffProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const group = await ctx.db.group.findUnique({
        where: { id: input.id },
        include: {
          homeroomTeacher: { include: { user: { select: { name: true } } } },
          students: {
            include: { user: { select: { name: true, email: true, isActive: true } } },
            orderBy: { user: { name: "asc" } },
          },
          timetableSlots: {
            include: {
              course: true,
              staff: { include: { user: { select: { name: true } } } },
            },
            orderBy: [{ dayOfWeek: "asc" }, { period: "asc" }],
          },
        },
      });
      if (!group) throw new TRPCError({ code: "NOT_FOUND" });
      return group;
    }),

  create: managementProcedure
    .input(z.object({
      name: z.string().min(1),
      grade: z.number().int().min(1).max(3),
      homeroomTeacherId: z.string().optional(),
    }))
    .mutation(({ ctx, input }) =>
      ctx.db.group.create({ data: input })
    ),

  update: managementProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      grade: z.number().int().min(1).max(3).optional(),
      homeroomTeacherId: z.string().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.db.group.update({ where: { id }, data });
    }),
});
