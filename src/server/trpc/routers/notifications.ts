import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../init";

export const notificationsRouter = createTRPCRouter({
  // For the bell dropdown — last 20, unnoticed first
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.notification.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }),

  // For the full notifications page — split into active and noticed
  listPage: protectedProcedure.query(async ({ ctx }) => {
    const [active, noticed] = await Promise.all([
      ctx.db.notification.findMany({
        where: { userId: ctx.session.user.id, noticedAt: null },
        orderBy: { createdAt: "desc" },
      }),
      ctx.db.notification.findMany({
        where: { userId: ctx.session.user.id, noticedAt: { not: null } },
        orderBy: { noticedAt: "desc" },
      }),
    ]);
    return { active, noticed };
  }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.notification.count({
      where: { userId: ctx.session.user.id, read: false },
    });
  }),

  markRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.notification.updateMany({
        where: { id: input.id, userId: ctx.session.user.id },
        data: { read: true },
      });
    }),

  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    return ctx.db.notification.updateMany({
      where: { userId: ctx.session.user.id, read: false },
      data: { read: true },
    });
  }),

  // Explicitly acknowledge a notification (moves to "Noticed" tab)
  markNoticed: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.notification.updateMany({
        where: { id: input.id, userId: ctx.session.user.id },
        data: { read: true, noticedAt: new Date() },
      });
    }),

  markAllNoticed: protectedProcedure.mutation(async ({ ctx }) => {
    return ctx.db.notification.updateMany({
      where: { userId: ctx.session.user.id, noticedAt: null },
      data: { read: true, noticedAt: new Date() },
    });
  }),
});
