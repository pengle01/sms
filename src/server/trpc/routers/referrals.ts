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

const RECOMMENDATION_VALUES = [
  "NO_RECOMMENDATION",
  "EXPULSION",
  "STRICT_MEASURE",
  "OBSERVATION",
  "STRICT_OBSERVATION",
  "NOTIFY_PARENTS",
  "OTHER_RECOMMENDATION",
] as const;

export const referralsRouter = createTRPCRouter({
  // File one or more referrals (one per student)
  create: staffProcedure
    .input(
      z.object({
        studentIds: z.array(z.string()).min(1),
        description: z.string().min(10),
        date: z.string(),
        location: z.string().optional(),
        incidentTime: z.string().optional(),
        extraInfo: z.string().optional(),
        recommendation: z.enum(RECOMMENDATION_VALUES).default("NO_RECOMMENDATION"),
        isDraft: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [staff, claim] = await Promise.all([
        ctx.db.staffProfile.findUnique({
          where: { userId: ctx.session.user.id },
          include: { user: { select: { name: true } } },
        }),
        ctx.db.teacherClaim.findUnique({
          where: { userId: ctx.session.user.id },
          select: { staffName: true },
        }),
      ]);
      if (!staff) throw new TRPCError({ code: "NOT_FOUND" });
      const filerDisplayName = claim?.staffName ?? staff.user?.name ?? "Εκπαιδευτικός";

      const students = await ctx.db.studentProfile.findMany({
        where: { id: { in: input.studentIds } },
        include: {
          group: {
            include: {
              homeroomHeadteacher: { include: { user: { select: { id: true, name: true } } } },
            },
          },
        },
      });

      const status = input.isDraft ? "DRAFT" : "PENDING";

      const referrals = await ctx.db.$transaction(async (tx) => {
        const created = await Promise.all(
          students.map((student) =>
            tx.referral.create({
              data: {
                studentId: student.id,
                filerId: staff.id,
                groupId: student.groupId,
                description: input.description,
                location: input.location,
                incidentTime: input.incidentTime,
                extraInfo: input.extraInfo,
                recommendation: input.recommendation,
                date: new Date(input.date),
                status,
              },
            })
          )
        );

        if (status === "PENDING") {
          const notified = new Set<string>();
          for (const student of students) {
            const headUserId = student.group?.homeroomHeadteacher?.user?.id;
            if (headUserId && !notified.has(headUserId)) {
              notified.add(headUserId);
              await tx.notification.create({
                data: {
                  userId: headUserId,
                  type: "REFERRAL_CREATED",
                  title: "Νέα καταγγελία",
                  body: `${filerDisplayName}: ${input.description.slice(0, 80)}`,
                  linkUrl: `/teacher/referrals`,
                  read: false,
                },
              });
            }
          }
        }

        return created;
      });

      return referrals;
    }),

  // Submit a saved draft → PENDING + notify headteacher
  submit: staffProcedure
    .input(z.object({ referralId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [staff, submitClaim] = await Promise.all([
        ctx.db.staffProfile.findUnique({
          where: { userId: ctx.session.user.id },
          include: { user: { select: { name: true } } },
        }),
        ctx.db.teacherClaim.findUnique({
          where: { userId: ctx.session.user.id },
          select: { staffName: true },
        }),
      ]);
      if (!staff) throw new TRPCError({ code: "NOT_FOUND" });
      const submitDisplayName = submitClaim?.staffName ?? staff.user?.name ?? "Εκπαιδευτικός";

      const referral = await ctx.db.referral.findUnique({
        where: { id: input.referralId },
        include: {
          student: {
            include: {
              group: {
                include: {
                  homeroomHeadteacher: { include: { user: { select: { id: true } } } },
                },
              },
            },
          },
        },
      });
      if (!referral) throw new TRPCError({ code: "NOT_FOUND" });
      if (referral.filerId !== staff.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (referral.status !== "DRAFT") throw new TRPCError({ code: "BAD_REQUEST", message: "Not a draft" });

      return ctx.db.$transaction(async (tx) => {
        const updated = await tx.referral.update({
          where: { id: input.referralId },
          data: { status: "PENDING" },
        });

        const headUserId = referral.student.group?.homeroomHeadteacher?.user?.id;
        if (headUserId) {
          await tx.notification.create({
            data: {
              userId: headUserId,
              type: "REFERRAL_CREATED",
              title: "Νέα καταγγελία",
              body: `${submitDisplayName}: ${referral.description.slice(0, 80)}`,
              linkUrl: `/teacher/referrals`,
              read: false,
            },
          });
        }

        return updated;
      });
    }),

  // Delete own draft
  delete: staffProcedure
    .input(z.object({ referralId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const staff = await ctx.db.staffProfile.findUnique({
        where: { userId: ctx.session.user.id },
      });
      if (!staff) throw new TRPCError({ code: "NOT_FOUND" });

      const referral = await ctx.db.referral.findUnique({
        where: { id: input.referralId },
      });
      if (!referral) throw new TRPCError({ code: "NOT_FOUND" });
      if (referral.filerId !== staff.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (referral.status !== "DRAFT") throw new TRPCError({ code: "BAD_REQUEST", message: "Only drafts can be deleted" });

      return ctx.db.referral.delete({ where: { id: input.referralId } });
    }),

  // List referrals — scope depends on role
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(["DRAFT", "PENDING", "ASSIGNED", "RESOLVED"]).optional(),
        studentId: z.string().optional(),
        groupId: z.string().optional(),
        myOnly: z.boolean().default(false),
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
      if (input.groupId) whereFilter.groupId = input.groupId;

      if (input.myOnly || role === "TEACHER" || role === "SCHOOL_ADMIN") {
        const staff = await ctx.db.staffProfile.findUnique({ where: { userId } });
        if (!staff) throw new TRPCError({ code: "NOT_FOUND" });
        whereFilter.filerId = staff.id;
      } else if (role === "HEADTEACHER_B" && !input.myOnly) {
        const staff = await ctx.db.staffProfile.findUnique({
          where: { userId },
          include: { homeroomHeadGroups: { select: { id: true } } },
        });
        if (!staff) throw new TRPCError({ code: "NOT_FOUND" });
        const groupIds = staff.homeroomHeadGroups.map((g) => g.id);
        whereFilter.groupId = { in: groupIds };
        // Exclude DRAFT status from homegroup view (drafts are private to filer)
        if (!input.status) whereFilter.status = { not: "DRAFT" };
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

      // extraInfo is private to the filer — strip it for everyone else
      const viewerStaff =
        role !== "SUPER_ADMIN"
          ? await ctx.db.staffProfile.findUnique({ where: { userId }, select: { id: true } })
          : null;

      const sanitized = items.map((r: (typeof items)[number]) => ({
        ...r,
        counselorNotes: canViewCounselorNotes(role) ? r.counselorNotes : undefined,
        extraInfo: viewerStaff?.id === r.filerId ? r.extraInfo : undefined,
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
        counselorNotes: z.string().optional(),
        parentContacted: z.boolean().default(false),
        parentContactDate: z.string().optional(),
        parentContactMethod: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const referral = await ctx.db.referral.findUnique({
        where: { id: input.referralId },
        include: {
          filer: { include: { user: { select: { id: true, name: true } } } },
        },
      });
      if (!referral) throw new TRPCError({ code: "NOT_FOUND" });

      const role = ctx.session.user.role as Role;

      // HEADTEACHER_B can only resolve referrals for their homegroup
      if (role === "HEADTEACHER_B") {
        const staff = await ctx.db.staffProfile.findUnique({
          where: { userId: ctx.session.user.id },
          include: { homeroomHeadGroups: { select: { id: true } } },
        });
        if (!staff) throw new TRPCError({ code: "NOT_FOUND" });
        const groupIds = staff.homeroomHeadGroups.map((g) => g.id);
        if (!referral.groupId || !groupIds.includes(referral.groupId)) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      return ctx.db.$transaction(async (tx) => {
        const [updated] = await Promise.all([
          tx.referral.update({
            where: { id: input.referralId },
            data: {
              status: "RESOLVED",
              counselorNotes: input.counselorNotes ?? referral.counselorNotes,
            },
          }),
          tx.referralResolution.create({
            data: {
              referralId: input.referralId,
              action: input.action,
              notes: input.notes,
              parentContacted: input.parentContacted,
              parentContactDate: input.parentContactDate ? new Date(input.parentContactDate) : undefined,
              parentContactMethod: input.parentContactMethod,
              resolvedById: ctx.session.user.id,
            },
          }),
        ]);

        const filerUserId = referral.filer.user?.id;
        if (filerUserId) {
          await tx.notification.create({
            data: {
              userId: filerUserId,
              type: "REFERRAL_RESOLVED",
              title: "Καταγγελία επιλύθηκε",
              body: `Ενέργεια: ${input.action.replace(/_/g, " ")}`,
              linkUrl: `/teacher/referrals`,
              read: false,
            },
          });
        }

        return updated;
      });
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
