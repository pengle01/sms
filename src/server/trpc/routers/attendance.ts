import { z } from "zod";
import { createTRPCRouter, staffProcedure, managementProcedure } from "../init";
import { TRPCError } from "@trpc/server";

export const attendanceRouter = createTRPCRouter({
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

      // Fetch the delay threshold global setting
      const thresholdSetting = await ctx.db.globalSetting.findUnique({
        where: { key: "delay_threshold_minutes" },
      });
      const threshold = thresholdSetting ? parseInt(thresholdSetting.value) : 15;

      const date = new Date(input.records[0]?.date ?? new Date());

      const upserted = await ctx.db.$transaction(
        input.records.map((r) => {
          const isAutoAbsent = r.minutesDelayed > threshold;
          const status = isAutoAbsent ? "ABSENT" : r.status;

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
            },
            update: {
              status,
              minutesDelayed: r.minutesDelayed,
              isAutoAbsent,
              staffId: staff.id,
            },
          });
        })
      );

      // Trigger SMS for period-1 absences (fire-and-forget; handled by a separate service call)
      const slot = await ctx.db.timetableSlot.findFirst({
        where: { id: input.records[0]?.timetableSlotId },
      });
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

      // Priority 1: Active exit permit
      const permit = await ctx.db.exitPermit.findFirst({
        where: {
          studentId: input.studentId,
          active: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
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
          teacher: slot.staff?.user?.name ?? slot.staffName ?? null,
          period: slot.period,
        };
      }

      return { status: "UNKNOWN" as const };
    }),
});
