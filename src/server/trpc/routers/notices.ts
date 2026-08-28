import { z } from "zod";
import { createTRPCRouter, staffProcedure, protectedProcedure } from "../init";
import { TRPCError } from "@trpc/server";
import type { Role } from "@/generated/prisma/client";
import { isStaff } from "@/lib/rbac";
import { ATTACHMENT_MAX_COUNT } from "@/lib/attachments";

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
            files: true,
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
        fileIds: z.array(z.string()).max(ATTACHMENT_MAX_COUNT).default([]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { tags, fileIds, ...rest } = input;

      // Every attachment must be one this user just uploaded. Without this check
      // a staff member could attach any existing file by id — including one on a
      // staff-only notice — and re-publish it to everyone.
      if (fileIds.length > 0) {
        const owned = await ctx.db.storedFile.count({
          where: { id: { in: fileIds }, uploadedById: ctx.session.user.id },
        });
        if (owned !== new Set(fileIds).size) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid attachment" });
        }
      }

      return ctx.db.notice.create({
        data: {
          ...rest,
          uploadedById: ctx.session.user.id,
          tags: {
            create: tags.map((tag) => ({ tag })),
          },
          files: { connect: fileIds.map((id) => ({ id })) },
        },
        include: { tags: true, files: true },
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
