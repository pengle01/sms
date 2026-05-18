import { z } from "zod";
import {
  createTRPCRouter,
  staffProcedure,
  managementProcedure,
  protectedProcedure,
  counselorProcedure,
} from "../init";
import { TRPCError } from "@trpc/server";
import { canViewAllReferrals, canViewCounselorNotes } from "@/lib/rbac";
import type { Role } from "@/generated/prisma";

export const referralsRouter = createTRPCRouter({
  // File a new referral (any staff member)
  create: staffProcedure
    .input(
      z.object({
        studentId: z.string(),
        description: z.string().min(10),
        date: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const staff = await ctx.db.staffProfile.findUnique({
        where: { userId: ctx.session.user.id },
        include: {
          user: { select: { name: true } },
        },
      });
      if (!staff) throw new TRPCError({ code: "NOT_FOUND" });

      const student = await ctx.db.studentProfile.findUnique({
        where: { id: input.studentId },
        include: { group: true },
      });
      if (!student) throw new TRPCError({ code: "NOT_FOUND", message: "Student not found" });

      return ctx.db.referral.create({
        data: {
          studentId: input.studentId,
          filerId: staff.id,
          groupId: student.groupId,
          description: input.description,
          date: new Date(input.date),
          status: "PENDING",
        },
        include: {
          student: { include: { user: { select: { name: true } } } },
          filer: { include: { user: { select: { name: true } } } },
        },
      });
    }),

  // List referrals — scope depends on role
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["PENDING", "ASSIGNED", "RESOLVED"]).optional(),
        studentId: z.string().optional(),
        page: z.number().int().min(1).default(1),
        limit: z.number().int().min(1).max(100).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const role = ctx.session.user.role as Role;
      const userId = ctx.session.user.id;

      let whereFilter: Record<string, unknown> = {};

      if (input.status) whereFilter.status = input.status;
      if (input.studentId) whereFilter.studentId = input.studentId;

      // Teachers only see referrals they filed
      if (role === "TEACHER") {
        const staff = await ctx.db.staffProfile.findUnique({
          where: { userId },
        });
        if (!staff) throw new TRPCError({ code: "NOT_FOUND" });
        whereFilter.filerId = staff.id;
      } else if (!canViewAllReferrals(role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const [total, items] = await Promise.all([
        ctx.db.referral.count({ where: whereFilter }),
        ctx.db.referral.findMany({
          where: whereFilter,
          include: {
            student: { include: { user: { select: { name: true } } } },
            filer: { include: { user: { select: { name: true } } } },
            group: true,
            resolution: true,
          },
          orderBy: { createdAt: "desc" },
          skip: (input.page - 1) * input.limit,
          take: input.limit,
        }),
      ]);

      // Strip counselor notes unless authorized
      const sanitized = items.map((r: (typeof items)[number]) => ({
        ...r,
        counselorNotes: canViewCounselorNotes(role) ? r.counselorNotes : undefined,
      }));

      return { items: sanitized, total, page: input.page };
    }),

  // Resolve a referral
  resolve: managementProcedure
    .input(
      z.object({
        referralId: z.string(),
        action: z.enum([
          "DETENTION",
          "PEDAGOGICAL_DIALOGUE",
          "WRITTEN_AGREEMENT",
          "WARNING",
          "OTHER",
        ]),
        notes: z.string().optional(),
        parentContacted: z.boolean().default(false),
        parentContactDate: z.string().optional(),
        parentContactMethod: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const referral = await ctx.db.referral.findUnique({
        where: { id: input.referralId },
      });
      if (!referral) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db.$transaction([
        ctx.db.referral.update({
          where: { id: input.referralId },
          data: { status: "RESOLVED" },
        }),
        ctx.db.referralResolution.create({
          data: {
            referralId: input.referralId,
            action: input.action,
            notes: input.notes,
            parentContacted: input.parentContacted,
            parentContactDate: input.parentContactDate
              ? new Date(input.parentContactDate)
              : undefined,
            parentContactMethod: input.parentContactMethod,
            resolvedById: ctx.session.user.id,
          },
        }),
      ]);
    }),

  // Update private counselor notes
  updateCounselorNotes: counselorProcedure
    .input(
      z.object({
        referralId: z.string(),
        notes: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.db.referral.update({
        where: { id: input.referralId },
        data: { counselorNotes: input.notes },
      });
    }),
});
