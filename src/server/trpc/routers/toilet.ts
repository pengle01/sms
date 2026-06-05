import { z } from "zod";
import { createTRPCRouter, staffProcedure } from "../init";
import { TRPCError } from "@trpc/server";
import { utcMidnight } from "@/lib/dates";

// Toilet breaks (έξοδοι τουαλέτας): the teacher records the exit when the
// student leaves and the return when they're back. Open breaks surface live
// on the duty desk, where a headteacher may also close them.
export const toiletRouter = createTRPCRouter({
  // Live feed for the duty desk — polled by the Τουαλέτα panel
  listToday: staffProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.toiletBreak.findMany({
      where: { date: utcMidnight() },
      include: {
        student: { select: { user: { select: { name: true } } } },
        group: { select: { name: true } },
        staff: { select: { scheduleName: true } },
      },
      orderBy: { leftAt: "asc" },
    });
    return rows.map((b) => ({
      id: b.id,
      studentId: b.studentId,
      studentName: b.student.user?.name ?? "—",
      groupName: b.group?.name ?? null,
      period: b.period,
      leftAt: b.leftAt.toISOString(),
      returnedAt: b.returnedAt?.toISOString() ?? null,
      staffName: b.staff.scheduleName,
    }));
  }),

  start: staffProcedure
    .input(
      z.object({
        studentId: z.string(),
        groupId: z.string().optional(),
        period: z.number().int().min(1).max(10),
        date: z.string(), // ISO date
      })
    )
    .mutation(async ({ ctx, input }) => {
      const staff = await ctx.db.staffProfile.findUnique({
        where: { userId: ctx.session.user.id },
        select: { id: true },
      });
      if (!staff) throw new TRPCError({ code: "NOT_FOUND" });

      const date = utcMidnight(input.date);

      // One open break per student — return the existing one instead of stacking
      const open = await ctx.db.toiletBreak.findFirst({
        where: { studentId: input.studentId, date, returnedAt: null },
      });
      if (open) return open;

      return ctx.db.toiletBreak.create({
        data: {
          studentId: input.studentId,
          staffId: staff.id,
          groupId: input.groupId ?? null,
          date,
          period: input.period,
          leftAt: new Date(),
        },
      });
    }),

  end: staffProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const brk = await ctx.db.toiletBreak.findUnique({ where: { id: input.id } });
      if (!brk) throw new TRPCError({ code: "NOT_FOUND" });
      if (brk.returnedAt) return brk; // already closed — idempotent
      return ctx.db.toiletBreak.update({
        where: { id: input.id },
        data: { returnedAt: new Date() },
      });
    }),
});
