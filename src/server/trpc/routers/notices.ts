import { z } from "zod";
import { createTRPCRouter, staffProcedure, protectedProcedure } from "../init";
import { TRPCError } from "@trpc/server";
import type { Role } from "@/generated/prisma/client";
import { isStaff, canDeleteNotice } from "@/lib/rbac";
import { writeAudit } from "@/server/audit";
import { removeUpload } from "@/server/uploads";
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

      const notice = await ctx.db.notice.create({
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

      await writeAudit({
        userId: ctx.session.user.id,
        action: "notice.create",
        resource: "Notice",
        resourceId: notice.id,
        details: { urgent: notice.urgent, staffOnly: notice.staffOnly },
      });

      return notice;
    }),

  /**
   * Withdraw a notice. There is no edit, so this is the only way to take back a
   * mistake — and a notice is school-wide, so it is limited to the author and
   * the system admin (canDeleteNotice states that rule once, for both this gate
   * and the button that calls it).
   */
  delete: staffProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const notice = await ctx.db.notice.findUnique({
        where: { id: input.id },
        select: { id: true, uploadedById: true, files: { select: { id: true } } },
      });
      if (!notice) throw new TRPCError({ code: "NOT_FOUND" });

      if (!canDeleteNotice(ctx.effectiveRoles, notice.uploadedById, ctx.session.user.id)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      // Tags and acknowledgments cascade, and Prisma clears the file join rows.
      await ctx.db.notice.delete({ where: { id: notice.id } });

      // Drop each attachment that nothing else still points at, or every
      // deletion leaves an unreachable file on disk. Same rule as announcements.
      for (const { id: fileId } of notice.files) {
        const file = await ctx.db.storedFile.findUnique({
          where: { id: fileId },
          select: {
            path: true,
            _count: { select: { notices: true, announcements: true, notifications: true } },
          },
        });
        if (
          file &&
          file._count.notices === 0 &&
          file._count.announcements === 0 &&
          file._count.notifications === 0
        ) {
          await ctx.db.storedFile.delete({ where: { id: fileId } });
          await removeUpload(file.path);
        }
      }

      await writeAudit({
        userId: ctx.session.user.id,
        action: "notice.delete",
        resource: "Notice",
        resourceId: notice.id,
      });

      return { success: true };
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
