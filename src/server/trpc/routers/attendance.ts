import { z } from "zod";
import { createTRPCRouter, staffProcedure, managementProcedure } from "../init";
import { TRPCError } from "@trpc/server";
import { permitByStudent } from "@/lib/exitPermit";
import { utcMidnight } from "@/lib/dates";
import { writeAudit } from "@/server/audit";
import { getAttendanceLockConfig, getSchoolYear } from "@/lib/schoolConfig";
import { isWithinSchoolYear } from "@/lib/schoolYear";
import { getPendingAttendance, type PendingLesson } from "@/server/attendanceLock";

const OUT_OF_YEAR_MSG = "Η ημερομηνία είναι εκτός των ορίων του σχολικού έτους.";

export const attendanceRouter = createTRPCRouter({
  // Attendance-completion lock status for the current teacher. Drives the
  // client guard that blocks the portal until past lessons are recorded.
  lockStatus: staffProcedure.query(async ({ ctx }) => {
    const config = await getAttendanceLockConfig();
    if (!config.enabled) return { locked: false, pending: [] as PendingLesson[] };
    const staff = await ctx.db.staffProfile.findUnique({
      where: { userId: ctx.session.user.id },
      select: { id: true },
    });
    if (!staff) return { locked: false, pending: [] as PendingLesson[] };
    const pending = await getPendingAttendance(staff.id, config.window);
    return { locked: pending.length > 0, pending };
  }),

  // Mark attendance for a timetable slot on a given date
  markAttendance: staffProcedure
    .input(
      z.object({
        records: z.array(
          z.object({
            studentId: z.string(),
            timetableSlotId: z.string(),
            date: z.string(), // ISO date string
            status: z.enum(["PRESENT", "ABSENT", "LATE"]),
            minutesDelayed: z.number().int().min(0).default(0),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const staff = await ctx.db.staffProfile.findUnique({
        where: { userId: ctx.session.user.id },
      });
      if (!staff) throw new TRPCError({ code: "NOT_FOUND" });

      // Reject any record dated outside the school year / active term.
      const ranges = await getSchoolYear();
      for (const r of input.records) {
        if (!isWithinSchoolYear(utcMidnight(r.date), ranges)) {
          throw new TRPCError({ code: "BAD_REQUEST", message: OUT_OF_YEAR_MSG });
        }
      }

      // Fetch the delay threshold global setting
      const thresholdSetting = await ctx.db.globalSetting.findUnique({
        where: { key: "delay_threshold_minutes" },
      });
      const threshold = thresholdSetting ? parseInt(thresholdSetting.value) : 15;

      const date = new Date(input.records[0]?.date ?? new Date());

      const slot = await ctx.db.timetableSlot.findFirst({
        where: { id: input.records[0]?.timetableSlotId },
      });

      // Ad-hoc claim visibility: marking a slot that is neither mine nor a
      // finalized-substitution assignment is a Κάλυψη — leave an audit trail
      // so management can trace who covered which class.
      if (slot && slot.staffId !== staff.id) {
        const assignment = await ctx.db.substitutionPlanEntry.findFirst({
          where: {
            plan: { date: utcMidnight(input.records[0]!.date), status: "FINAL" },
            timetableSlotId: slot.id,
          },
          select: { id: true },
        });
        if (!assignment) {
          await writeAudit({
            userId: ctx.session.user.id,
            action: "attendance.claimMark",
            resource: "timetableSlot",
            resourceId: slot.id,
            details: { groupId: slot.groupId, period: slot.period, date: input.records[0]!.date },
          });
        }
      }

      // Active exit permits covering this date/period — link the absence so the
      // office admin sees it was part of an Άδεια Εξόδου.
      const permits = slot
        ? await ctx.db.exitPermit.findMany({
            where: {
              date,
              active: true,
              studentId: { in: input.records.map((r) => r.studentId) },
            },
          })
        : [];
      const permitFor = slot ? permitByStudent(permits, date, slot.period) : {};

      const upserted = await ctx.db.$transaction(
        input.records.map((r) => {
          const isAutoAbsent = r.minutesDelayed > threshold;
          const status = isAutoAbsent ? "ABSENT" : r.status;
          const exitPermitId = permitFor[r.studentId]?.id ?? null;

          return ctx.db.attendance.upsert({
            where: {
              studentId_timetableSlotId_date: {
                studentId: r.studentId,
                timetableSlotId: r.timetableSlotId,
                date: new Date(r.date),
              },
            },
            create: {
              studentId: r.studentId,
              timetableSlotId: r.timetableSlotId,
              staffId: staff.id,
              date: new Date(r.date),
              status,
              minutesDelayed: r.minutesDelayed,
              isAutoAbsent,
              exitPermitId,
            },
            update: {
              status,
              minutesDelayed: r.minutesDelayed,
              isAutoAbsent,
              staffId: staff.id,
              exitPermitId,
            },
          });
        })
      );

      // Trigger SMS for period-1 absences (fire-and-forget; handled by a separate service call)
      if (slot?.period === 1) {
        // IDs of students newly marked absent in period 1
        const absentIds = upserted
          .filter((r: (typeof upserted)[number]) => r.status === "ABSENT" && !r.smsSent)
          .map((r: (typeof upserted)[number]) => r.studentId);

        if (absentIds.length > 0) {
          // Queue SMS — actual sending is done by the SMS service router
          await ctx.db.attendance.updateMany({
            where: {
              studentId: { in: absentIds },
              timetableSlotId: input.records[0]?.timetableSlotId,
              date,
            },
            data: { smsSent: true },
          });
        }
      }

      return upserted;
    }),

  // Mark intercalary period-8 attendance (no timetable slot required)
  markIntercalaryAttendance: staffProcedure
    .input(
      z.object({
        groupId: z.string(),
        period: z.number().int(),
        date: z.string(),
        records: z.array(
          z.object({
            studentId: z.string(),
            status: z.enum(["PRESENT", "ABSENT", "LATE"]),
            minutesDelayed: z.number().int().min(0).default(0),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const staff = await ctx.db.staffProfile.findUnique({
        where: { userId: ctx.session.user.id },
      });
      if (!staff) throw new TRPCError({ code: "NOT_FOUND" });

      // Reject dates outside the school year / active term.
      const ranges = await getSchoolYear();
      if (!isWithinSchoolYear(utcMidnight(input.date), ranges)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: OUT_OF_YEAR_MSG });
      }

      const thresholdSetting = await ctx.db.globalSetting.findUnique({
        where: { key: "delay_threshold_minutes" },
      });
      const threshold = thresholdSetting ? parseInt(thresholdSetting.value) : 15;

      const dateObj = new Date(input.date);

      // Link absences to a covering exit permit (Άδεια Εξόδου)
      const permits = await ctx.db.exitPermit.findMany({
        where: {
          date: dateObj,
          active: true,
          studentId: { in: input.records.map((r) => r.studentId) },
        },
      });
      const permitFor = permitByStudent(permits, dateObj, input.period);

      await ctx.db.$transaction(
        input.records.map((r) => {
          const isAutoAbsent = r.minutesDelayed > threshold;
          const status = isAutoAbsent ? "ABSENT" : r.status;
          const exitPermitId = permitFor[r.studentId]?.id ?? null;

          return ctx.db.attendance.upsert({
            where: {
              studentId_intercalaryGroupId_intercalaryPeriod_date: {
                studentId: r.studentId,
                intercalaryGroupId: input.groupId,
                intercalaryPeriod: input.period,
                date: dateObj,
              },
            },
            create: {
              studentId: r.studentId,
              staffId: staff.id,
              date: dateObj,
              status,
              minutesDelayed: r.minutesDelayed,
              isAutoAbsent,
              intercalaryGroupId: input.groupId,
              intercalaryPeriod: input.period,
              exitPermitId,
            },
            update: {
              status,
              minutesDelayed: r.minutesDelayed,
              isAutoAbsent,
              staffId: staff.id,
              exitPermitId,
            },
          });
        })
      );

      return { success: true };
    }),

  // Get today's absence report for headteachers/admins
  dailyAbsenceReport: managementProcedure
    .input(z.object({ date: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const date = input.date ? new Date(input.date) : new Date();
      date.setHours(0, 0, 0, 0);

      return ctx.db.attendance.findMany({
        where: {
          date,
          OR: [{ status: "ABSENT" }, { isAutoAbsent: true }],
        },
        include: {
          student: {
            include: {
              user: { select: { name: true, email: true } },
              group: true,
            },
          },
          timetableSlot: {
            include: { course: true },
          },
        },
        orderBy: [
          { student: { group: { name: "asc" } } },
          { timetableSlot: { period: "asc" } },
        ],
      });
    }),

  // Locate a student right now (Dynamic Location Engine)
  locateStudent: staffProcedure
    .input(z.object({ studentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon…
      // Rough current period based on time (school must configure period times globally)
      const hour = now.getHours();
      const minute = now.getMinutes();
      const totalMinutes = hour * 60 + minute;

      // Priority 1: Active exit permit for today (covers fromPeriod → end of day)
      const permit = await ctx.db.exitPermit.findFirst({
        where: {
          studentId: input.studentId,
          active: true,
          date: utcMidnight(now),
        },
      });
      if (permit) {
        return { status: "OFF_SITE" as const, reason: permit.reason };
      }

      // Priority 2: Activity in current period
      // Simplified: find any activity today that covers a period overlapping now
      const activity = await ctx.db.activityParticipant.findFirst({
        where: {
          studentId: input.studentId,
          activity: { date: today },
        },
        include: { activity: true },
      });
      if (activity) {
        return {
          status: "AT_ACTIVITY" as const,
          activityName: activity.activity.name,
          location: activity.activity.location,
        };
      }

      // Priority 3: Timetable
      const slot = await ctx.db.timetableSlot.findFirst({
        where: {
          dayOfWeek,
          group: {
            students: { some: { id: input.studentId } },
          },
        },
        include: {
          course: true,
          staff: { include: { user: { select: { name: true } } } },
        },
        orderBy: { period: "asc" },
      });

      if (slot) {
        return {
          status: "IN_CLASS" as const,
          room: slot.room,
          course: slot.course.name,
          teacher: slot.staff?.scheduleName ?? slot.staffName ?? slot.staff?.user?.name ?? null,
          period: slot.period,
        };
      }

      return { status: "UNKNOWN" as const };
    }),
});
