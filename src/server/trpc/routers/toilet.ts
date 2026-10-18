import { z } from "zod";
import { createTRPCRouter, staffProcedure } from "../init";
import { TRPCError } from "@trpc/server";
import { utcMidnight, localDateStr, getNow } from "@/lib/dates";
import { writeAudit } from "@/server/audit";
import { resolveBreakEdit } from "@/lib/toilet";
import type { db as appDb } from "@/server/db";

/** The exit, if the caller recorded it — only the recording teacher may correct it. */
async function ownBreak(db: typeof appDb, userId: string, id: string) {
  const [staff, brk] = await Promise.all([
    db.staffProfile.findUnique({ where: { userId }, select: { id: true } }),
    db.toiletBreak.findUnique({ where: { id } }),
  ]);
  if (!brk) throw new TRPCError({ code: "NOT_FOUND" });
  if (!staff || brk.staffId !== staff.id) throw new TRPCError({ code: "FORBIDDEN" });
  return brk;
}

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

  // Correct an exit: fix the times (a forgotten or late return tap) or reopen
  // it while it's still today. Times are "HH:MM" in Cyprus on the exit's date.
  update: staffProcedure
    .input(z.object({ id: z.string(), leftAt: z.string(), returnedAt: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const brk = await ownBreak(ctx.db, ctx.session.user.id, input.id);
      const dateIso = brk.date.toISOString().slice(0, 10);
      const res = resolveBreakEdit({
        dateIso,
        leftAt: input.leftAt,
        returnedAt: input.returnedAt,
        now: new Date(),
        isToday: dateIso === localDateStr(getNow()),
      });
      if ("error" in res) throw new TRPCError({ code: "BAD_REQUEST", message: res.error });
      const updated = await ctx.db.toiletBreak.update({
        where: { id: brk.id },
        data: { leftAt: res.leftAt, returnedAt: res.returnedAt },
      });
      await writeAudit({
        userId: ctx.session.user.id,
        action: "toilet.update",
        resource: "ToiletBreak",
        resourceId: brk.id,
        details: {
          studentId: brk.studentId,
          before: { leftAt: brk.leftAt.toISOString(), returnedAt: brk.returnedAt?.toISOString() ?? null },
          after: { leftAt: res.leftAt.toISOString(), returnedAt: res.returnedAt?.toISOString() ?? null },
        },
      });
      return updated;
    }),

  // Remove an exit tapped by mistake.
  remove: staffProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const brk = await ownBreak(ctx.db, ctx.session.user.id, input.id);
      await ctx.db.toiletBreak.delete({ where: { id: brk.id } });
      await writeAudit({
        userId: ctx.session.user.id,
        action: "toilet.remove",
        resource: "ToiletBreak",
        resourceId: brk.id,
        details: {
          studentId: brk.studentId,
          date: brk.date.toISOString().slice(0, 10),
          period: brk.period,
          leftAt: brk.leftAt.toISOString(),
          returnedAt: brk.returnedAt?.toISOString() ?? null,
        },
      });
      return { id: brk.id, studentId: brk.studentId };
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
