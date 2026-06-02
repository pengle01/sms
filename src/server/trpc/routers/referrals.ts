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
import { localDateStr } from "@/lib/dates";
import { expulsionDaysInPast } from "@/lib/periods";
import { writeAudit } from "@/server/audit";
import type { Role } from "@/generated/prisma";

function reqMeta(req?: Request) {
  const fwd = req?.headers.get("x-forwarded-for");
  return {
    ipAddress: fwd ? fwd.split(",")[0]!.trim() : req?.headers.get("x-real-ip") ?? null,
    userAgent: req?.headers.get("user-agent") ?? null,
  };
}

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
      resolution: { include: { expulsionDays: { orderBy: { date: "asc" as const } } } },
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

  // Mark a referral as opened by a headteacher (idempotent — first open wins).
  // Drives the at-a-glance colour code (red → yellow once opened).
  markOpened: managementProcedure
    .input(z.object({ referralId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const res = await ctx.db.referral.updateMany({
        where: { id: input.referralId, openedAt: null, isDraft: false },
        data: { openedAt: new Date() },
      });
      return { changed: res.count > 0 };
    }),

  // Resolve students in a referral.
  // Pass referralStudentId to resolve a single student; omit to resolve all eligible.
  // HEADTEACHER_B → limited to students from their homegroup.
  // Management / Admin → all pending students.
  resolve: managementProcedure
    .input(
      z.object({
        referralId: z.string(),
        referralStudentId: z.string().optional(),
        action: z.enum(["DETENTION", "PEDAGOGICAL_DIALOGUE", "WRITTEN_AGREEMENT", "WARNING", "OTHER"]),
        notes: z.string().optional(),
        counselorNotes: z.string().optional(),
        expulsionDays: z.array(z.string()).optional(), // ISO date strings, only for DETENTION
        parentContacted: z.boolean().default(false),
        parentContactDate: z.string().optional(),
        parentContactMethod: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const role = ctx.session.user.role as Role;

      // Punishments may only be scheduled today or in the future, never the past.
      if (
        input.action === "DETENTION" &&
        input.expulsionDays?.length &&
        expulsionDaysInPast(input.expulsionDays, localDateStr()).length > 0
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Οι ημέρες αποβολής δεν μπορούν να είναι στο παρελθόν",
        });
      }

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

      const result = await ctx.db.$transaction(async (tx) => {
        // Create per-student resolutions (individually to support nested expulsionDays)
        const expulsionDates =
          input.action === "DETENTION" && input.expulsionDays?.length
            ? input.expulsionDays.map((d) => ({ date: new Date(d) }))
            : [];

        await Promise.all(
          resolvableIds.map((rsId) =>
            tx.referralStudentResolution.create({
              data: {
                referralStudentId: rsId,
                action: input.action,
                notes: input.notes,
                counselorNotes: input.counselorNotes,
                parentContacted: input.parentContacted,
                parentContactDate: input.parentContactDate ? new Date(input.parentContactDate) : undefined,
                parentContactMethod: input.parentContactMethod,
                resolvedById: ctx.session.user.id,
                ...(expulsionDates.length ? { expulsionDays: { create: expulsionDates } } : {}),
              },
            })
          )
        );

        // Mark those students as RESOLVED
        await tx.referralStudent.updateMany({
          where: { id: { in: resolvableIds } },
          data: { status: "RESOLVED" },
        });

        // Resolving implies the referral was opened — backfill if it wasn't recorded.
        await tx.referral.updateMany({
          where: { id: input.referralId, openedAt: null },
          data: { openedAt: new Date() },
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

      await writeAudit({
        userId: ctx.session.user.id,
        action: "referral.resolve",
        resource: "Referral",
        resourceId: input.referralId,
        details: { action: input.action, studentIds: resolvableIds, allResolved: result.allResolved },
        ...reqMeta(ctx.req),
      });

      return result;
    }),

  // Send SMS to parents of resolved students in a referral
  sendResolutionSms: managementProcedure
    .input(
      z.object({
        referralId: z.string(),
        referralStudentId: z.string().optional(), // send for one student only
        message: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { sendSms } = await import("@/lib/sms");

      const referral = await ctx.db.referral.findUnique({
        where: { id: input.referralId },
        include: {
          students: {
            where: input.referralStudentId ? { id: input.referralStudentId } : { status: "RESOLVED" },
            include: {
              student: {
                include: {
                  user: { select: { name: true } },
                  smsContacts: { where: { active: true } },
                },
              },
            },
          },
        },
      });
      if (!referral) throw new TRPCError({ code: "NOT_FOUND" });

      const results: { studentName: string; phone: string; success: boolean; error?: string }[] = [];

      for (const rs of referral.students) {
        const contacts = rs.student.smsContacts;
        for (const contact of contacts) {
          const result = await sendSms(contact.phone, input.message);
          // Log the SMS
          await ctx.db.smsLog.create({
            data: {
              studentId: rs.studentId,
              smsContactId: contact.id,
              phoneNumber: contact.phone,
              message: input.message,
              status: result.success ? "SENT" : "FAILED",
              gatewayResponse: result.gatewayResponse ?? result.error,
            },
          });
          results.push({
            studentName: rs.student.user?.name ?? rs.studentId,
            phone: contact.phone,
            success: result.success,
            error: result.error,
          });
        }
      }

      await writeAudit({
        userId: ctx.session.user.id,
        action: "referral.sendSms",
        resource: "Referral",
        resourceId: input.referralId,
        details: { recipients: results.length, sent: results.filter((r) => r.success).length },
        ...reqMeta(ctx.req),
      });

      return { results };
    }),

  // Student dossier for a referral: contact phone numbers + past referrals.
  // Visible to roles that can view all referrals (headteachers, headmaster, counselor, admin).
  studentContext: staffProcedure
    .input(z.object({ studentId: z.string(), excludeReferralId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const role = ctx.session.user.role as Role;
      if (!canViewAllReferrals(role)) throw new TRPCError({ code: "FORBIDDEN" });

      // HEADTEACHER_B may only inspect students in groups they head.
      if (role === "HEADTEACHER_B") {
        const staff = await ctx.db.staffProfile.findUnique({
          where: { userId: ctx.session.user.id },
          include: { homeroomHeadGroups: { select: { id: true } } },
        });
        const target = await ctx.db.studentProfile.findUnique({
          where: { id: input.studentId },
          select: { groupId: true },
        });
        const headGroupIds = new Set(staff?.homeroomHeadGroups.map((g) => g.id) ?? []);
        if (!target?.groupId || !headGroupIds.has(target.groupId)) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }

      const student = await ctx.db.studentProfile.findUnique({
        where: { id: input.studentId },
        include: {
          user: { select: { name: true } },
          group: { select: { name: true } },
          smsContacts: {
            where: { active: true },
            select: { id: true, name: true, phone: true, role: true },
            orderBy: { name: "asc" },
          },
          referralStudents: {
            where: input.excludeReferralId
              ? { referralId: { not: input.excludeReferralId } }
              : {},
            include: {
              referral: { select: { id: true, number: true, date: true, description: true, location: true } },
              resolution: {
                select: {
                  action: true,
                  expulsionDays: { select: { date: true }, orderBy: { date: "asc" as const } },
                },
              },
            },
            orderBy: { referral: { date: "desc" } },
          },
        },
      });
      if (!student) throw new TRPCError({ code: "NOT_FOUND" });

      return {
        name: student.user?.name ?? "—",
        group: student.group?.name ?? null,
        contacts: student.smsContacts,
        pastReferrals: student.referralStudents.map((rs) => ({
          id: rs.referral.id,
          number: rs.referral.number,
          date: rs.referral.date,
          description: rs.referral.description,
          location: rs.referral.location,
          status: rs.status as string,
          action: rs.resolution?.action ?? null,
          expulsionCount: rs.resolution?.expulsionDays.length ?? 0,
        })),
      };
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
