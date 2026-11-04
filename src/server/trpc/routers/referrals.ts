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
import { localDateStr, isFutureDay } from "@/lib/dates";
import { DEFAULT_PERIODS_PER_DAY } from "@/lib/periods";
import { getPeriodsPerDay } from "@/lib/schoolConfig";
import { validatePunishment, PUNISHMENT_ERROR_EL } from "@/lib/punishment";
import { ACTION_ORDER, actionLabel, resolutionSummary } from "@/lib/referralLabels";
import { canDeleteReferral, canEditDraft, draftStudentChanges, editRequestState, lockedStudentIds } from "@/lib/referralStatus";
import { writeAudit } from "@/server/audit";
import type { Prisma, Role } from "@/generated/prisma/client";
import { parentCard } from "@/lib/smsContacts";
import { canResolve, canEscalate, canCarryOut, canRequestReturn, decisionOutcome, expulsionLimitFor, nextLevel, LEVEL_LABEL } from "@/lib/referralLevels";
import { loadReferralViewer } from "@/server/referralViewer";

function reqMeta(req?: Request) {
  const fwd = req?.headers.get("x-forwarded-for");
  return {
    ipAddress: fwd ? fwd.split(",")[0]!.trim() : req?.headers.get("x-real-ip") ?? null,
    userAgent: req?.headers.get("user-agent") ?? null,
  };
}

// What a teacher may recommend (several at once; none = no recommendation).
const RECOMMENDATION_VALUES = [
  "EXPULSION",
  "STRICT_MEASURE",
  "OBSERVATION",
  "STRICT_OBSERVATION",
  "NOTIFY_PARENTS",
  "OTHER_RECOMMENDATION",
] as const;

// The referral form's fields — filed new (create) or saved again as a draft (updateDraft).
const referralFields = z.object({
  studentIds: z.array(z.string()).min(1),
  /** Short title of the offence — the parent letter's «Παράπτωμα». */
  title: z.string().trim().max(120).optional(),
  description: z.string().min(10),
  date: z.string(),
  location: z.string().optional(),
  incidentTime: z.string().optional(),
  extraInfo: z.string().optional(),
  recommendations: z.array(z.enum(RECOMMENDATION_VALUES)).max(RECOMMENDATION_VALUES.length).default([]),
  isDraft: z.boolean().default(false),
});

function checkReferralFields(input: { date: string; isDraft: boolean; title?: string }) {
  // An incident is reported for today or an earlier day, never a future one.
  if (isFutureDay(input.date, localDateStr())) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Η ημερομηνία του παραπτώματος δεν μπορεί να είναι μελλοντική." });
  }
  if (!input.isDraft && !input.title) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Συμπληρώστε τον τίτλο του παραπτώματος." });
  }
}

/** On filing (never for a draft): tell each student's homegroup headteacher, once each. */
async function notifyHeadteachersOfFiling(
  tx: Prisma.TransactionClient,
  students: { group: { homeroomHeadteacher: { user: { id: string } | null } | null } | null }[],
  filerDisplayName: string,
  description: string,
  title = "Νέα καταγγελία",
) {
  const notified = new Set<string>();
  for (const s of students) {
    const headUserId = s.group?.homeroomHeadteacher?.user?.id;
    if (headUserId && !notified.has(headUserId)) {
      notified.add(headUserId);
      await tx.notification.create({
        data: {
          userId: headUserId,
          type: "REFERRAL_CREATED",
          title,
          body: `${filerDisplayName}: ${description.slice(0, 80)}`,
          linkUrl: `/teacher/referrals`,
          read: false,
        },
      });
    }
  }
}

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
    .input(referralFields)
    .mutation(async ({ ctx, input }) => {
      checkReferralFields(input);
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
      const filerDisplayName = staff.scheduleName ?? claim?.staffName ?? staff.user?.name ?? "Εκπαιδευτικός";

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
            title: input.title || null,
            description: input.description,
            location: input.location,
            incidentTime: input.incidentTime,
            extraInfo: input.extraInfo,
            recommendations: [...new Set(input.recommendations)],
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

        if (!input.isDraft) await notifyHeadteachersOfFiling(tx, students, filerDisplayName, input.description);

        return referral;
      });
    }),

  // Save a draft again — still a draft, or filed (isDraft: false). Only its
  // filer, only while it is a draft. Headteachers hear of it only when filed.
  updateDraft: staffProcedure
    .input(referralFields.extend({ referralId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      checkReferralFields(input);
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
      const filerDisplayName = staff.scheduleName ?? claim?.staffName ?? staff.user?.name ?? "Εκπαιδευτικός";

      const referral = await ctx.db.referral.findUnique({
        where: { id: input.referralId },
        select: {
          isDraft: true,
          filerId: true,
          number: true,
          students: {
            select: { studentId: true, status: true, level: true, resolution: { select: { id: true } }, _count: { select: { escalations: { where: { returnedAt: null } } } } },
          },
          // Returned to drafts by an approved edit request: it was filed before.
          editRequests: { where: { status: "APPROVED" }, select: { id: true }, take: 1 },
        },
      });
      if (!referral) throw new TRPCError({ code: "NOT_FOUND" });
      if (!canEditDraft(referral, staff.id)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Η καταγγελία έχει ήδη υποβληθεί και δεν αλλάζει." });
      }

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
      if (students.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Επιλέξτε μαθητή/τρια." });
      const { add, remove } = draftStudentChanges(
        referral.students.map((rs) => rs.studentId),
        students.map((s) => s.id),
      );
      // A student already decided or referred up stays on the referral —
      // removing them would delete the decision.
      const locked = new Set(
        lockedStudentIds(
          referral.students.map((rs) => ({
            studentId: rs.studentId,
            status: rs.status,
            level: rs.level,
            hasResolution: !!rs.resolution,
            escalationCount: rs._count.escalations,
          })),
        ),
      );
      if (remove.some((id) => locked.has(id))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Δεν μπορείτε να αφαιρέσετε μαθητή/τρια για τον/την οποίο/α υπάρχει ήδη απόφαση ή παραπομπή." });
      }
      const refiled = referral.editRequests.length > 0;

      return ctx.db.$transaction(async (tx) => {
        // Guard against a concurrent filing/withdrawal between the read and here.
        const changed = await tx.referral.updateMany({
          where: { id: input.referralId, isDraft: true, filerId: staff.id },
          data: {
            title: input.title || null,
            description: input.description,
            location: input.location || null,
            incidentTime: input.incidentTime || null,
            extraInfo: input.extraInfo || null,
            recommendations: [...new Set(input.recommendations)],
            date: new Date(input.date),
            isDraft: input.isDraft,
            // Filing: it reaches the headteachers now, so it counts as new from
            // now — unless it was filed before and returned for editing.
            ...(input.isDraft || refiled ? {} : { createdAt: new Date() }),
          },
        });
        if (changed.count === 0) {
          throw new TRPCError({ code: "CONFLICT", message: "Η καταγγελία έχει ήδη υποβληθεί και δεν αλλάζει." });
        }
        if (remove.length) {
          await tx.referralStudent.deleteMany({ where: { referralId: input.referralId, studentId: { in: remove } } });
        }
        const addSet = new Set(add);
        for (const s of students) {
          // New students join; kept ones take their current homegroup.
          if (addSet.has(s.id)) {
            await tx.referralStudent.create({
              data: { referralId: input.referralId, studentId: s.id, groupId: s.groupId, status: "PENDING" },
            });
          } else {
            await tx.referralStudent.updateMany({
              where: { referralId: input.referralId, studentId: s.id },
              data: { groupId: s.groupId },
            });
          }
        }

        if (!input.isDraft) {
          await notifyHeadteachersOfFiling(
            tx,
            students,
            filerDisplayName,
            input.description,
            refiled ? `Τροποποιημένη καταγγελία #${referral.number}` : undefined,
          );
        }

        return { id: input.referralId, isDraft: input.isDraft };
      });
    }),

  // The filer asks to edit a FILED referral — even one a headteacher has
  // opened. The admin decides (admin «Καταγγελίες»); approval returns it to
  // the filer's drafts to edit and file again.
  requestEdit: staffProcedure
    .input(z.object({ referralId: z.string(), reason: z.string().trim().min(5, "Γράψτε τον λόγο της τροποποίησης") }))
    .mutation(async ({ ctx, input }) => {
      const staff = await ctx.db.staffProfile.findUnique({ where: { userId: ctx.session.user.id }, select: { id: true } });
      if (!staff) throw new TRPCError({ code: "NOT_FOUND" });
      const referral = await ctx.db.referral.findUnique({
        where: { id: input.referralId },
        select: { number: true, isDraft: true, filerId: true, editRequests: { select: { status: true } } },
      });
      if (!referral) throw new TRPCError({ code: "NOT_FOUND" });
      const state = editRequestState(referral, staff.id, referral.editRequests);
      if (state !== "canRequest") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: state === "pending" ? "Υπάρχει ήδη αίτημα σε αναμονή" : "Δεν μπορείτε να ζητήσετε τροποποίηση αυτής της καταγγελίας",
        });
      }

      const created = await ctx.db.$transaction(async (tx) => {
        const req = await tx.referralEditRequest.create({
          data: { referralId: input.referralId, requestedById: ctx.session.user.id, reason: input.reason },
        });
        const admins = await tx.user.findMany({
          where: { isActive: true, OR: [{ role: "SUPER_ADMIN" }, { extraRoles: { has: "SUPER_ADMIN" } }] },
          select: { id: true },
        });
        for (const admin of admins) {
          await tx.notification.create({
            data: {
              userId: admin.id,
              type: "REFERRAL_EDIT_REQUESTED",
              title: `Αίτημα τροποποίησης καταγγελίας #${referral.number}`,
              body: input.reason.slice(0, 120),
              linkUrl: `/admin/referrals`,
              read: false,
            },
          });
        }
        return req;
      });

      await writeAudit({
        userId: ctx.session.user.id,
        action: "referral.editRequest",
        resource: "ReferralEditRequest",
        resourceId: created.id,
        details: { referralId: input.referralId, number: referral.number, reason: input.reason },
        ...reqMeta(ctx.req),
      });
      return { ok: true };
    }),

  // Withdraw a referral: a draft, or one filed but not yet opened by a
  // headteacher. See canDeleteReferral for the rule.
  delete: staffProcedure
    .input(z.object({ referralId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const staff = await ctx.db.staffProfile.findUnique({ where: { userId: ctx.session.user.id } });
      if (!staff) throw new TRPCError({ code: "NOT_FOUND" });

      const referral = await ctx.db.referral.findUnique({
        where: { id: input.referralId },
        select: {
          id: true,
          number: true,
          isDraft: true,
          openedAt: true,
          filerId: true,
          students: { select: { status: true, level: true, resolution: { select: { id: true } }, _count: { select: { escalations: { where: { returnedAt: null } } } } } },
          resolution: { select: { id: true } },
        },
      });
      if (!referral) throw new TRPCError({ code: "NOT_FOUND" });
      if (referral.filerId !== staff.id) throw new TRPCError({ code: "FORBIDDEN" });

      const lockable = {
        ...referral,
        students: referral.students.map((rs) => ({
          status: rs.status,
          level: rs.level,
          hasResolution: !!rs.resolution,
          escalationCount: rs._count.escalations,
        })),
      };
      if (!canDeleteReferral(lockable, staff.id)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Η καταγγελία έχει ήδη ανοιχτεί και δεν διαγράφεται.",
        });
      }
      // ReferralResolution has no cascade (deleting would hit a FK restrict),
      // and its presence means the referral was acted on regardless.
      if (referral.resolution) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Η καταγγελία έχει ήδη ανοιχτεί και δεν διαγράφεται.",
        });
      }

      await ctx.db.referral.delete({ where: { id: input.referralId } });

      // Drafts were never visible to anyone else; a filed referral was, so its
      // withdrawal is a real event in the disciplinary record.
      if (!referral.isDraft) {
        await writeAudit({
          userId: ctx.session.user.id,
          action: "referral.withdraw",
          resource: "Referral",
          resourceId: input.referralId,
          details: { number: referral.number, students: referral.students.length },
        });
      }

      return { id: input.referralId, wasDraft: referral.isDraft };
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
        // Their homegroups' referrals — and, for the «Πειθαρχικό Συμβούλιο»
        // headteacher, every referral with a student referred to the council.
        whereFilter.students = staff.disciplinaryCouncil
          ? { some: { OR: [{ groupId: { in: headGroupIds } }, { escalations: { some: { toLevel: "COUNCIL" } } }] } }
          : { some: { groupId: { in: headGroupIds } } };
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

      // Everyone who can see a referral sees its full info; only the private
      // counselor notes stay role-gated.
      const sanitized = items.map((r) => ({
        ...r,
        counselorNotes: canViewCounselorNotes(role) ? r.counselorNotes : undefined,
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
  // ONLY the corresponding headteacher may resolve: a student can be resolved
  // solely by the homeroom headteacher of their group, whoever the caller is.
  resolve: managementProcedure
    .input(
      z.object({
        referralId: z.string(),
        referralStudentId: z.string().optional(),
        action: z.enum(ACTION_ORDER),
        // Required description of the punishment imposed/agreed.
        actionDetails: z.string().trim().min(5, "Απαιτείται περιγραφή του παιδαγωγικού μέτρου"),
        notes: z.string().optional(),
        counselorNotes: z.string().optional(),
        // Only for DETENTION: each day the whole day or periods from–to. A bare
        // ISO date string is still accepted as a whole day.
        expulsionDays: z
          .array(
            z.union([
              z.string(),
              z.object({
                date: z.string(),
                fromPeriod: z.number().int().nullish(),
                toPeriod: z.number().int().nullish(),
              }),
            ]),
          )
          .optional(),
        // Only for SUSPENDED_EXPULSION: its length, no dates.
        suspendedDays: z.number().int().nullish(),
        suspendedPeriods: z.number().int().nullish(),
        parentContacted: z.boolean().default(false),
        parentContactDate: z.string().optional(),
        parentContactMethod: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const expulsionDays = (input.expulsionDays ?? []).map((d) => (typeof d === "string" ? { date: d } : d));

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
      if (referral.isDraft) throw new TRPCError({ code: "BAD_REQUEST", message: "Η καταγγελία επέστρεψε στα πρόχειρα του/της εκπαιδευτικού για τροποποίηση — περιμένετε να υποβληθεί ξανά." });

      // Each student is decided at their level (src/lib/referralLevels.ts): the
      // homegroup headteacher, the headmaster or the «Πειθαρχικό Συμβούλιο».
      const viewer = await loadReferralViewer(ctx.session.user.id, ctx.effectiveRoles);
      if (!viewer) throw new TRPCError({ code: "NOT_FOUND" });
      // Here only the homegroup level decides a full measure; the headmaster and
      // the council set an expulsion's days through `decide`.
      const eligible = referral.students.filter(
        (rs) => rs.level === "HOMEGROUP" && canResolve({ groupId: rs.groupId, level: rs.level, resolved: !!rs.resolution }, viewer),
      );
      const eligibleIds = eligible.map((rs) => rs.id);

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

      // The punishment's length: dated days for an expulsion (today or later,
      // school days, valid period ranges, within the level's limit), a length
      // for a suspended one.
      const maxDays = expulsionLimitFor(eligible.filter((rs) => resolvableIds.includes(rs.id)).map((rs) => rs.level));
      const lengthError = validatePunishment(
        { ...input, expulsionDays },
        { ...DEFAULT_PERIODS_PER_DAY, ...(await getPeriodsPerDay()) },
        localDateStr(),
        maxDays,
      );
      if (lengthError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            lengthError === "tooManyDays"
              ? `Έως ${maxDays} ημέρες αποβολής σε αυτό το επίπεδο — για περισσότερες, παραπέμψτε την καταγγελία.`
              : PUNISHMENT_ERROR_EL[lengthError],
        });
      }

      const result = await ctx.db.$transaction(async (tx) => {
        // Create per-student resolutions (individually to support nested expulsionDays)
        const expulsionDates =
          input.action === "DETENTION"
            ? expulsionDays.map((d) => ({
                date: new Date(d.date),
                fromPeriod: d.fromPeriod ?? null,
                toPeriod: d.toPeriod ?? null,
              }))
            : [];
        const suspended =
          input.action === "SUSPENDED_EXPULSION"
            ? { suspendedDays: input.suspendedDays || null, suspendedPeriods: input.suspendedPeriods || null }
            : {};

        const now = new Date();
        for (const rsId of resolvableIds) {
          await tx.referralStudentResolution.create({
            data: {
              referralStudentId: rsId,
              action: input.action,
              actionDetails: input.actionDetails,
              notes: input.notes,
              counselorNotes: input.counselorNotes,
              parentContacted: input.parentContacted,
              parentContactDate: input.parentContactDate ? new Date(input.parentContactDate) : undefined,
              parentContactMethod: input.parentContactMethod,
              resolvedById: ctx.session.user.id,
              decidedLevel: "HOMEGROUP",
              carriedOutById: ctx.session.user.id,
              carriedOutAt: now,
              ...suspended,
              ...(expulsionDates.length ? { expulsionDays: { create: expulsionDates } } : {}),
            },
          });
        }
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
                body: `Ενέργεια: ${actionLabel(input.action)}`,
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

  // The headmaster asks to send a student referred to them by mistake back to
  // the homegroup headteacher; the admin decides (admin «Καταγγελίες»).
  requestReturn: managementProcedure
    .input(z.object({ referralStudentId: z.string(), reason: z.string().trim().min(5, "Γράψτε τον λόγο") }))
    .mutation(async ({ ctx, input }) => {
      const viewer = await loadReferralViewer(ctx.session.user.id, ctx.effectiveRoles);
      if (!viewer) throw new TRPCError({ code: "NOT_FOUND" });
      const rs = await ctx.db.referralStudent.findUnique({
        where: { id: input.referralStudentId },
        select: {
          level: true,
          resolution: { select: { id: true } },
          returnRequests: { where: { status: "PENDING" }, select: { id: true } },
          referral: { select: { id: true, number: true, isDraft: true } },
          student: { select: { user: { select: { name: true } } } },
        },
      });
      if (!rs || rs.referral.isDraft) throw new TRPCError({ code: "NOT_FOUND" });
      if (!canRequestReturn({ level: rs.level, resolved: !!rs.resolution, pendingReturn: rs.returnRequests.length > 0 }, viewer)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Δεν μπορείτε να ζητήσετε επιστροφή αυτής της παραπομπής" });
      }

      const created = await ctx.db.$transaction(async (tx) => {
        const req = await tx.referralReturnRequest.create({
          data: { referralStudentId: input.referralStudentId, requestedById: ctx.session.user.id, reason: input.reason },
        });
        const admins = await tx.user.findMany({
          where: { isActive: true, OR: [{ role: "SUPER_ADMIN" }, { extraRoles: { has: "SUPER_ADMIN" } }] },
          select: { id: true },
        });
        for (const admin of admins) {
          await tx.notification.create({
            data: {
              userId: admin.id,
              type: "REFERRAL_RETURN_REQUESTED",
              title: `Αίτημα ακύρωσης παραπομπής — καταγγελία #${rs.referral.number}`,
              body: `${rs.student.user?.name ?? ""}: ${input.reason.slice(0, 100)}`,
              linkUrl: `/admin/referrals`,
              read: false,
            },
          });
        }
        return req;
      });

      await writeAudit({
        userId: ctx.session.user.id,
        action: "referral.returnRequest",
        resource: "ReferralReturnRequest",
        resourceId: created.id,
        details: { referralId: rs.referral.id, referralStudentId: input.referralStudentId, reason: input.reason },
        ...reqMeta(ctx.req),
      });
      return { ok: true };
    }),

  // The headmaster / «Πειθαρχικό Συμβούλιο» decide a referred student: always
  // an expulsion, only its number of days (up to the level's limit). The
  // student returns to the homegroup headteacher, who picks the dates and does
  // the rest (carryOut).
  decide: managementProcedure
    .input(
      z.object({
        referralId: z.string(),
        referralStudentIds: z.array(z.string()).min(1),
        days: z.number().int().min(1),
        notes: z.string().trim().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const viewer = await loadReferralViewer(ctx.session.user.id, ctx.effectiveRoles);
      if (!viewer) throw new TRPCError({ code: "NOT_FOUND" });
      const referral = await ctx.db.referral.findUnique({
        where: { id: input.referralId },
        select: {
          number: true,
          isDraft: true,
          students: {
            where: { id: { in: input.referralStudentIds } },
            select: {
              id: true,
              groupId: true,
              level: true,
              resolution: { select: { id: true } },
              group: { select: { homeroomHeadteacher: { select: { user: { select: { id: true } } } } } },
            },
          },
        },
      });
      if (!referral || referral.students.length !== input.referralStudentIds.length) throw new TRPCError({ code: "NOT_FOUND" });
      if (referral.isDraft) throw new TRPCError({ code: "BAD_REQUEST", message: "Η καταγγελία επέστρεψε στα πρόχειρα του/της εκπαιδευτικού για τροποποίηση — περιμένετε να υποβληθεί ξανά." });
      for (const rs of referral.students) {
        if (rs.level === "HOMEGROUP" || !canResolve({ groupId: rs.groupId, level: rs.level, resolved: !!rs.resolution }, viewer)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Cannot decide this student" });
        }
      }
      const max = expulsionLimitFor(referral.students.map((rs) => rs.level));
      if (input.days > max) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Έως ${max} ημέρες αποβολής σε αυτό το επίπεδο.` });
      }

      await ctx.db.$transaction(async (tx) => {
        for (const rs of referral.students) {
          await tx.referralStudentResolution.create({
            data: {
              referralStudentId: rs.id,
              action: "DETENTION",
              decidedDays: input.days,
              notes: input.notes || null,
              resolvedById: ctx.session.user.id,
              decidedLevel: rs.level,
            },
          });
          // Back to the homegroup headteacher, still pending, to carry it out
          const moved = await tx.referralStudent.updateMany({
            where: { id: rs.id, level: rs.level, status: "PENDING" },
            data: decisionOutcome(rs.level),
          });
          if (moved.count !== 1) throw new TRPCError({ code: "CONFLICT", message: "Η καταγγελία άλλαξε στο μεταξύ — ανανεώστε τη σελίδα" });
        }
        await tx.referral.updateMany({ where: { id: input.referralId, openedAt: null }, data: { openedAt: new Date() } });
        const heads = new Set(
          referral.students.map((rs) => rs.group?.homeroomHeadteacher?.user?.id).filter((id): id is string => !!id),
        );
        for (const userId of heads) {
          await tx.notification.create({
            data: {
              userId,
              type: "REFERRAL_DECIDED",
              title: `Καταγγελία #${referral.number}: αποβολή ${input.days} ${input.days === 1 ? "ημέρας" : "ημερών"} — προς εκτέλεση`,
              body: "Ορίστε τις ημερομηνίες, ενημερώστε τους γονείς και ολοκληρώστε την επίλυση.",
              linkUrl: `/teacher/referrals`,
              read: false,
            },
          });
        }
      });

      await writeAudit({
        userId: ctx.session.user.id,
        action: "referral.decide",
        resource: "Referral",
        resourceId: input.referralId,
        details: { referralStudentIds: input.referralStudentIds, days: input.days, levels: referral.students.map((rs) => rs.level) },
        ...reqMeta(ctx.req),
      });
      return { ok: true };
    }),

  // The homegroup headteacher carries out a measure the headmaster or the
  // «Πειθαρχικό Συμβούλιο» chose: records the parent contact and resolves the
  // student (the filer is told once the whole referral is resolved).
  carryOut: managementProcedure
    .input(
      z.object({
        referralId: z.string(),
        referralStudentIds: z.array(z.string()).min(1),
        // The expulsion's dates — exactly as many as the decision's days.
        expulsionDays: z
          .array(z.object({ date: z.string(), fromPeriod: z.number().int().nullish(), toPeriod: z.number().int().nullish() }))
          .min(1),
        actionDetails: z.string().trim().min(5, "Απαιτείται περιγραφή του παιδαγωγικού μέτρου"),
        notes: z.string().optional(),
        counselorNotes: z.string().optional(),
        parentContacted: z.boolean().default(false),
        parentContactDate: z.string().optional(),
        parentContactMethod: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const viewer = await loadReferralViewer(ctx.session.user.id, ctx.effectiveRoles);
      if (!viewer) throw new TRPCError({ code: "NOT_FOUND" });
      const students = await ctx.db.referralStudent.findMany({
        where: { id: { in: input.referralStudentIds }, referralId: input.referralId, referral: { isDraft: false } },
        select: {
          id: true,
          groupId: true,
          level: true,
          status: true,
          resolution: { select: { id: true, action: true, decidedDays: true } },
        },
      });
      if (students.length !== input.referralStudentIds.length) throw new TRPCError({ code: "NOT_FOUND" });
      // Several students at once only when they were given the same days.
      const decided = new Set(students.map((rs) => rs.resolution?.decidedDays ?? null));
      const decidedDays = [...decided][0];
      if (decided.size !== 1 || decidedDays == null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Οι μαθητές έχουν διαφορετικές αποφάσεις — εκτελέστε τις χωριστά" });
      }
      const lengthError = validatePunishment(
        { action: "DETENTION", expulsionDays: input.expulsionDays },
        { ...DEFAULT_PERIODS_PER_DAY, ...(await getPeriodsPerDay()) },
        localDateStr(),
        undefined,
        decidedDays,
      );
      if (lengthError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            lengthError === "wrongDayCount"
              ? `Επιλέξτε ακριβώς ${decidedDays} ${decidedDays === 1 ? "ημερομηνία" : "ημερομηνίες"} αποβολής, όπως η απόφαση.`
              : PUNISHMENT_ERROR_EL[lengthError],
        });
      }
      for (const rs of students) {
        const ok = canCarryOut(
          { groupId: rs.groupId, level: rs.level, hasDecision: !!rs.resolution, pending: rs.status === "PENDING" },
          viewer,
        );
        if (!ok) throw new TRPCError({ code: "FORBIDDEN", message: "Δεν υπάρχει απόφαση προς εκτέλεση για αυτόν/ήν τον/τη μαθητή/τρια" });
      }

      const result = await ctx.db.$transaction(async (tx) => {
        const now = new Date();
        for (const rs of students) {
          await tx.referralStudentResolution.update({
            where: { id: rs.resolution!.id },
            data: {
              actionDetails: input.actionDetails,
              ...(input.notes ? { notes: input.notes } : {}),
              ...(input.counselorNotes ? { counselorNotes: input.counselorNotes } : {}),
              parentContacted: input.parentContacted,
              parentContactDate: input.parentContactDate ? new Date(input.parentContactDate) : null,
              parentContactMethod: input.parentContactMethod || null,
              carriedOutById: ctx.session.user.id,
              carriedOutAt: now,
              expulsionDays: {
                create: input.expulsionDays.map((d) => ({
                  date: new Date(d.date),
                  fromPeriod: d.fromPeriod ?? null,
                  toPeriod: d.toPeriod ?? null,
                })),
              },
            },
          });
          const moved = await tx.referralStudent.updateMany({ where: { id: rs.id, status: "PENDING" }, data: { status: "RESOLVED" } });
          if (moved.count !== 1) throw new TRPCError({ code: "CONFLICT", message: "Η καταγγελία άλλαξε στο μεταξύ — ανανεώστε τη σελίδα" });
        }
        const anyPending = await tx.referralStudent.findFirst({ where: { referralId: input.referralId, status: "PENDING" } });
        if (!anyPending) {
          const referral = await tx.referral.findUnique({
            where: { id: input.referralId },
            select: { filer: { select: { user: { select: { id: true } } } } },
          });
          const filerUserId = referral?.filer.user?.id;
          if (filerUserId) {
            await tx.notification.create({
              data: {
                userId: filerUserId,
                type: "REFERRAL_RESOLVED",
                title: "Καταγγελία επιλύθηκε",
                body: `Ενέργεια: ${actionLabel(students[0]!.resolution!.action)}`,
                linkUrl: `/teacher/referrals`,
                read: false,
              },
            });
          }
        }
        return { allResolved: !anyPending };
      });

      await writeAudit({
        userId: ctx.session.user.id,
        action: "referral.carryOut",
        resource: "Referral",
        resourceId: input.referralId,
        details: { referralStudentIds: input.referralStudentIds, allResolved: result.allResolved },
        ...reqMeta(ctx.req),
      });
      return result;
    }),

  // Refer students up a level (homegroup headteacher → headmaster →
  // «Πειθαρχικό Συμβούλιο»), one-way, with a reason. Only whoever may decide
  // the student now may refer them; the next level is notified.
  escalate: managementProcedure
    .input(
      z.object({
        referralId: z.string(),
        referralStudentIds: z.array(z.string()).min(1),
        reason: z.string().trim().min(5, "Γράψτε τον λόγο της παραπομπής"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const viewer = await loadReferralViewer(ctx.session.user.id, ctx.effectiveRoles);
      if (!viewer) throw new TRPCError({ code: "NOT_FOUND" });
      const students = await ctx.db.referralStudent.findMany({
        where: { id: { in: input.referralStudentIds }, referralId: input.referralId, referral: { isDraft: false } },
        select: { id: true, groupId: true, level: true, resolution: { select: { id: true } } },
      });
      if (students.length !== input.referralStudentIds.length) throw new TRPCError({ code: "NOT_FOUND" });
      for (const rs of students) {
        if (!canEscalate({ groupId: rs.groupId, level: rs.level, resolved: !!rs.resolution }, viewer)) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Δεν μπορείτε να παραπέμψετε αυτόν/ήν τον/τη μαθητή/τρια" });
        }
      }
      const toLevels = new Set(students.map((rs) => nextLevel(rs.level)!));

      await ctx.db.$transaction(async (tx) => {
        for (const rs of students) {
          const to = nextLevel(rs.level)!;
          // Guard against a concurrent decision: only a still-pending student at this level moves.
          const moved = await tx.referralStudent.updateMany({
            where: { id: rs.id, level: rs.level, status: "PENDING" },
            data: { level: to },
          });
          if (moved.count !== 1) throw new TRPCError({ code: "CONFLICT", message: "Η καταγγελία άλλαξε στο μεταξύ — ανανεώστε τη σελίδα" });
          await tx.referralEscalation.create({
            data: { referralStudentId: rs.id, fromLevel: rs.level, toLevel: to, reason: input.reason, escalatedById: ctx.session.user.id },
          });
        }
        // Tell the next level: every headmaster, or the council headteacher.
        const recipients = await tx.user.findMany({
          where: {
            isActive: true,
            OR: [
              ...(toLevels.has("HEADMASTER") ? [{ role: "HEADMASTER" as const }, { extraRoles: { has: "HEADMASTER" as const } }] : []),
              ...(toLevels.has("COUNCIL") ? [{ staffProfile: { disciplinaryCouncil: true } }] : []),
            ],
          },
          select: { id: true },
        });
        const referral = await tx.referral.findUnique({ where: { id: input.referralId }, select: { number: true, title: true } });
        const to = [...toLevels].map((l) => LEVEL_LABEL[l]).join(", ");
        for (const r of recipients) {
          await tx.notification.create({
            data: {
              userId: r.id,
              type: "REFERRAL_ESCALATED",
              title: `Παραπομπή καταγγελίας #${referral?.number ?? ""} — ${to}`,
              body: `${referral?.title ? `${referral.title}: ` : ""}${input.reason.slice(0, 120)}`,
              linkUrl: `/teacher/referrals`,
              read: false,
            },
          });
        }
      });

      await writeAudit({
        userId: ctx.session.user.id,
        action: "referral.escalate",
        resource: "Referral",
        resourceId: input.referralId,
        details: { referralStudentIds: input.referralStudentIds, to: [...toLevels], reason: input.reason },
        ...reqMeta(ctx.req),
      });
      return { ok: true };
    }),

  // A headteacher asks to UNLOCK a resolution THEY made. The admin only
  // approves the unlocking — approval deletes the resolution and the student
  // moves back to PENDING (the referral returns to the examine tab).
  requestResolutionUnlock: managementProcedure
    .input(
      z.object({
        resolutionId: z.string(),
        reason: z.string().trim().min(5, "Απαιτείται αιτιολόγηση του ξεκλειδώματος"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const resolution = await ctx.db.referralStudentResolution.findUnique({
        where: { id: input.resolutionId },
        include: {
          expulsionDays: { orderBy: { date: "asc" } },
          referralStudent: {
            include: {
              referral: { select: { number: true } },
              student: { include: { user: { select: { name: true } } } },
              unlockRequests: { where: { status: "PENDING" }, select: { id: true } },
            },
          },
        },
      });
      if (!resolution) throw new TRPCError({ code: "NOT_FOUND" });
      // Only the headteacher who made the decision may ask to unlock it.
      if (resolution.resolvedById !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Μόνο όποιος έλαβε την απόφαση μπορεί να ζητήσει ξεκλείδωμα" });
      }
      if (resolution.referralStudent.unlockRequests.length > 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Εκκρεμεί ήδη αίτημα ξεκλειδώματος" });
      }

      // Snapshot the decision — approval deletes the resolution itself.
      const snapshot = JSON.stringify({
        action: resolution.action,
        actionDetails: resolution.actionDetails,
        notes: resolution.notes,
        expulsionDays: resolution.expulsionDays.map((d) =>
          d.fromPeriod != null && d.toPeriod != null
            ? { date: d.date.toISOString().slice(0, 10), fromPeriod: d.fromPeriod, toPeriod: d.toPeriod }
            : d.date.toISOString().slice(0, 10),
        ),
        suspendedDays: resolution.suspendedDays,
        suspendedPeriods: resolution.suspendedPeriods,
        resolvedAt: resolution.resolvedAt.toISOString(),
      });

      const request = await ctx.db.$transaction(async (tx) => {
        const created = await tx.resolutionUnlockRequest.create({
          data: {
            referralStudentId: resolution.referralStudentId,
            requestedById: ctx.session.user.id,
            reason: input.reason,
            snapshot,
          },
        });

        // Notify every active super admin (primary or extra-role grant).
        const admins = await tx.user.findMany({
          where: {
            isActive: true,
            OR: [{ role: "SUPER_ADMIN" }, { extraRoles: { has: "SUPER_ADMIN" } }],
          },
          select: { id: true },
        });
        const studentName = resolution.referralStudent.student.user?.name ?? "";
        for (const admin of admins) {
          await tx.notification.create({
            data: {
              userId: admin.id,
              type: "RESOLUTION_UNLOCK_REQUESTED",
              title: "Αίτημα ξεκλειδώματος απόφασης",
              body: `Καταγγελία #${resolution.referralStudent.referral.number} · ${studentName}: ${input.reason.slice(0, 80)}`,
              linkUrl: `/admin/referrals`,
              read: false,
            },
          });
        }

        return created;
      });

      await writeAudit({
        userId: ctx.session.user.id,
        action: "referral.unlockRequest",
        resource: "ResolutionUnlockRequest",
        resourceId: request.id,
        details: { referralStudentId: resolution.referralStudentId },
        ...reqMeta(ctx.req),
      });

      return request;
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
          // Every contact on record — "active" only decides who receives SMS,
          // not who the deputy may call (see parentCard).
          smsContacts: {
            select: { id: true, name: true, phone: true, role: true, isDefault: true },
            orderBy: [{ isDefault: "desc" }, { name: "asc" }],
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
                  suspendedDays: true,
                  suspendedPeriods: true,
                  expulsionDays: { select: { date: true, fromPeriod: true, toPeriod: true }, orderBy: { date: "asc" as const } },
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
        // The parents by name and role with every phone; the SMS number only marks the preferred one.
        contactCard: parentCard(student.smsContacts),
        pastReferrals: student.referralStudents.map((rs) => ({
          id: rs.referral.id,
          number: rs.referral.number,
          date: rs.referral.date,
          description: rs.referral.description,
          location: rs.referral.location,
          status: rs.status as string,
          action: rs.resolution?.action ?? null,
          expulsionCount: rs.resolution?.expulsionDays.length ?? 0,
          // «Αποβολή · 1 ημέρα + 3 περίοδοι», «Αποβολή με Αναστολή · 2 ημέρες», …
          summary: rs.resolution ? resolutionSummary(rs.resolution) : null,
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
