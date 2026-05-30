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

// Include shape reused across list queries
const referralInclude = {
  filer: { include: { user: { select: { name: true } } } },
  students: {
    include: {
      student: { include: { user: { select: { name: true } } } },
      group: { select: { name: true } },
      resolution: true,
    },
    orderBy: { student: { user: { name: "asc" } } } as const,
  },
} as const;

export const referralsRouter = createTRPCRouter({
  // File a referral — one Referral + one ReferralStudent per selected student
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
              homeroomHeadteacher: { include: { user: { select: { id: true } } } },
            },
          },
        },
      });

      return ctx.db.$transaction(async (tx) => {
        const referral = await tx.referral.create({
          data: {
            filerId: staff.id,
            description: input.description,
            location: input.location,
            incidentTime: input.incidentTime,
            extraInfo: input.extraInfo,
            recommendation: input.recommendation,
            date: new Date(input.date),
            isDraft: input.isDraft,
            students: {
              create: students.map((s) => ({
                studentId: s.id,
                groupId: s.groupId,
                status: "PENDING",
              })),
            },
          },
          include: referralInclude,
        });

        if (!input.isDraft) {
          const notified = new Set<string>();
          for (const s of students) {
            const headUserId = s.group?.homeroomHeadteacher?.user?.id;
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

        return referral;
      });
    }),

  // Promote a draft to submitted and notify headteachers
  submit: staffProcedure
    .input(z.object({ referralId: z.string() }))
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

      const referral = await ctx.db.referral.findUnique({
        where: { id: input.referralId },
        include: {
          students: {
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
      if (!referral.isDraft) throw new TRPCError({ code: "BAD_REQUEST", message: "Not a draft" });

      return ctx.db.$transaction(async (tx) => {
        const updated = await tx.referral.update({
          where: { id: input.referralId },
          data: { isDraft: false },
        });

        const notified = new Set<string>();
        for (const rs of referral.students) {
          const headUserId = rs.group?.homeroomHeadteacher?.user?.id;
          if (headUserId && !notified.has(headUserId)) {
            notified.add(headUserId);
            await tx.notification.create({
              data: {
                userId: headUserId,
                type: "REFERRAL_CREATED",
                title: "Νέα καταγγελία",
                body: `${filerDisplayName}: ${referral.description.slice(0, 80)}`,
                linkUrl: `/teacher/referrals`,
                read: false,
              },
            });
          }
        }

        return updated;
      });
    }),

  // Delete a draft referral
  delete: staffProcedure
    .input(z.object({ referralId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const staff = await ctx.db.staffProfile.findUnique({ where: { userId: ctx.session.user.id } });
      if (!staff) throw new TRPCError({ code: "NOT_FOUND" });

      const referral = await ctx.db.referral.findUnique({ where: { id: input.referralId } });
      if (!referral) throw new TRPCError({ code: "NOT_FOUND" });
      if (referral.filerId !== staff.id) throw new TRPCError({ code: "FORBIDDEN" });
      if (!referral.isDraft) throw new TRPCError({ code: "BAD_REQUEST", message: "Only drafts can be deleted" });

      return ctx.db.referral.delete({ where: { id: input.referralId } });
    }),

  // List referrals — scope depends on role
  list: protectedProcedure
    .input(
      z.object({
        // Overall pending/resolved is derived from per-student status
        studentStatus: z.enum(["PENDING", "RESOLVED"]).optional(),
        isDraft: z.boolean().optional(),
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
      if (input.isDraft !== undefined) whereFilter.isDraft = input.isDraft;
      if (input.groupId) whereFilter.students = { some: { groupId: input.groupId } };
      // Derive overall pending/resolved from per-student status
      if (input.studentStatus === "PENDING") {
        whereFilter.students = {
          some: { ...(input.groupId ? { groupId: input.groupId } : {}), status: "PENDING" },
        };
      } else if (input.studentStatus === "RESOLVED") {
        whereFilter.students = { every: { status: "RESOLVED" }, some: {} };
      }

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
        const headGroupIds = staff.homeroomHeadGroups.map((g) => g.id);
        whereFilter.students = { some: { groupId: { in: headGroupIds } } };
        whereFilter.isDraft = false;
      } else if (!canViewAllReferrals(role)) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      const [total, items] = await Promise.all([
        ctx.db.referral.count({ where: whereFilter }),
        ctx.db.referral.findMany({
          where: whereFilter,
          include: referralInclude,
          orderBy: { createdAt: "desc" },
          skip: (input.page - 1) * input.limit,
          take: input.limit,
        }),
      ]);

      // Extra-info visible to filer only; counselor notes controlled by role
      const viewerStaff =
        role !== "SUPER_ADMIN"
          ? await ctx.db.staffProfile.findUnique({ where: { userId }, select: { id: true } })
          : null;

      const sanitized = items.map((r) => ({
        ...r,
        counselorNotes: canViewCounselorNotes(role) ? r.counselorNotes : undefined,
        extraInfo: viewerStaff?.id === r.filerId ? r.extraInfo : undefined,
      }));

      return { items: sanitized, total, page: input.page };
    }),

  // Resolve students in a referral.
  // Pass referralStudentId to resolve a single student; omit to resolve all eligible.
  // HEADTEACHER_B → limited to students from their homegroup.
  // Management / Admin → all pending students.
  resolve: managementProcedure
    .input(
      z.object({
        referralId: z.string(),
        referralStudentId: z.string().optional(), // resolve one specific student
        action: z.enum(["DETENTION", "PEDAGOGICAL_DIALOGUE", "WRITTEN_AGREEMENT", "WARNING", "OTHER"]),
        notes: z.string().optional(),
        counselorNotes: z.string().optional(),
        parentContacted: z.boolean().default(false),
        parentContactDate: z.string().optional(),
        parentContactMethod: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role as Role;

      const referral = await ctx.db.referral.findUnique({
        where: { id: input.referralId },
        include: {
          filer: { include: { user: { select: { id: true } } } },
          students: {
            include: { resolution: { select: { id: true } } },
          },
        },
      });
      if (!referral) throw new TRPCError({ code: "NOT_FOUND" });

      // Determine which students this user can resolve
      let eligibleIds: string[];

      if (role === "HEADTEACHER_B") {
        const staff = await ctx.db.staffProfile.findUnique({
          where: { userId: ctx.session.user.id },
          include: { homeroomHeadGroups: { select: { id: true } } },
        });
        if (!staff) throw new TRPCError({ code: "NOT_FOUND" });
        const headGroupIds = new Set(staff.homeroomHeadGroups.map((g) => g.id));
        eligibleIds = referral.students
          .filter((rs) => rs.groupId && headGroupIds.has(rs.groupId) && !rs.resolution)
          .map((rs) => rs.id);
      } else {
        eligibleIds = referral.students.filter((rs) => !rs.resolution).map((rs) => rs.id);
      }

      // If a specific student was requested, resolve only them (after checking eligibility)
      let resolvableIds: string[];
      if (input.referralStudentId) {
        if (!eligibleIds.includes(input.referralStudentId))
          throw new TRPCError({ code: "FORBIDDEN", message: "Cannot resolve this student" });
        resolvableIds = [input.referralStudentId];
      } else {
        resolvableIds = eligibleIds;
      }

      if (resolvableIds.length === 0)
        throw new TRPCError({ code: "BAD_REQUEST", message: "No students to resolve" });

      return ctx.db.$transaction(async (tx) => {
        // Create per-student resolutions
        await tx.referralStudentResolution.createMany({
          data: resolvableIds.map((rsId) => ({
            referralStudentId: rsId,
            action: input.action,
            notes: input.notes,
            counselorNotes: input.counselorNotes,
            parentContacted: input.parentContacted,
            parentContactDate: input.parentContactDate ? new Date(input.parentContactDate) : undefined,
            parentContactMethod: input.parentContactMethod,
            resolvedById: ctx.session.user.id,
          })),
        });

        // Mark those students as RESOLVED
        await tx.referralStudent.updateMany({
          where: { id: { in: resolvableIds } },
          data: { status: "RESOLVED" },
        });

        // Whole referral is resolved once no student remains PENDING
        const anyPending = await tx.referralStudent.findFirst({
          where: { referralId: input.referralId, status: "PENDING" },
        });
        const allResolved = !anyPending;

        if (allResolved) {
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
        }

        return { allResolved };
      });
    }),

  // Update private counselor notes
  updateCounselorNotes: counselorProcedure
    .input(z.object({ referralId: z.string(), notes: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.referral.update({
        where: { id: input.referralId },
        data: { counselorNotes: input.notes },
      });
    }),
});
