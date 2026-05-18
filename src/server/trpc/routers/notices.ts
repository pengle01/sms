import { z } from "zod";
import { createTRPCRouter, staffProcedure, protectedProcedure } from "../init";
import { TRPCError } from "@trpc/server";
import type { Role } from "@/generated/prisma";
import { isStaff } from "@/lib/rbac";

export const noticesRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z.object({
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const role = ctx.session.user.role as Role;
      const staffOnly = !isStaff(role) ? false : undefined;

      const where = {
        ...(staffOnly !== undefined ? { staffOnly } : {}),
      };

      const [total, items] = await Promise.all([
        ctx.db.notice.count({ where }),
        ctx.db.notice.findMany({
          where,
          include: {
            tags: true,
            acknowledgments: {
              where: { userId: ctx.session.user.id },
            },
            file: true,
          },
          orderBy: [{ urgent: "desc" }, { createdAt: "desc" }],
          skip: (input.page - 1) * input.limit,
          take: input.limit,
        }),
      ]);

      return { items, total, page: input.page };
    }),

  create: staffProcedure
    .input(
      z.object({
        title: z.string().min(1),
        titleEl: z.string().optional(),
        body: z.string().min(1),
        bodyEl: z.string().optional(),
        urgent: z.boolean().default(false),
        staffOnly: z.boolean().default(false),
        gradeTarget: z.number().int().min(1).max(3).optional(),
        tags: z.array(z.string()).default([]),
        fileId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { tags, ...rest } = input;
      return ctx.db.notice.create({
        data: {
          ...rest,
          uploadedById: ctx.session.user.id,
          tags: {
            create: tags.map((tag) => ({ tag })),
          },
        },
        include: { tags: true },
      });
    }),

  acknowledge: protectedProcedure
    .input(z.object({ noticeId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.noticeAcknowledgment.upsert({
        where: {
          noticeId_userId: {
            noticeId: input.noticeId,
            userId: ctx.session.user.id,
          },
        },
        create: {
          noticeId: input.noticeId,
          userId: ctx.session.user.id,
        },
        update: {},
      });
    }),

  // Get acknowledgment stats for staff compliance reporting
  acknowledgmentStats: staffProcedure
    .input(z.object({ noticeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const notice = await ctx.db.notice.findUnique({
        where: { id: input.noticeId },
        include: { acknowledgments: { include: { notice: true } } },
      });
      if (!notice) throw new TRPCError({ code: "NOT_FOUND" });

      const totalStaff = await ctx.db.user.count({
        where: { role: { in: ["TEACHER", "SCHOOL_ADMIN", "HEADMASTER", "HEADTEACHER_A", "HEADTEACHER_B", "STUDENT_COUNSELOR", "SUPER_ADMIN"] }, isActive: true },
      });

      return {
        acknowledged: notice.acknowledgments.length,
        total: totalStaff,
        percentage: Math.round((notice.acknowledgments.length / totalStaff) * 100),
      };
    }),
});
