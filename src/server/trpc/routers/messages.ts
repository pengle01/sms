import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "../init";
import type { Context } from "../context";
import { reachableStaffIds, isUnreadForStaff, isUnreadForFamily } from "@/lib/messaging";
import { staffDisplayName } from "@/lib/staffName";
import { logger, errInfo } from "@/server/logger";

type Db = Context["db"];

// ── Helpers ───────────────────────────────────────────────────────────────────

// The staff (with linked accounts) a student may message: subject teachers +
// homegroup teacher/headteacher/counselor.
async function reachableStaffSet(db: Db, studentId: string): Promise<Set<string>> {
  const student = await db.studentProfile.findUnique({
    where: { id: studentId },
    select: {
      groupId: true,
      subjectGroups: { select: { groupId: true } },
      group: { select: { homeroomTeacherId: true, homeroomHeadteacherId: true, counselorId: true } },
    },
  });
  if (!student) return new Set();
  const groupIds = [student.groupId, ...student.subjectGroups.map((s) => s.groupId)].filter(
    Boolean
  ) as string[];
  const slots = groupIds.length
    ? await db.timetableSlot.findMany({ where: { groupId: { in: groupIds } }, select: { staffId: true } })
    : [];
  const ids = reachableStaffIds({
    subjectTeacherIds: slots.map((s) => s.staffId),
    homeroomTeacherId: student.group?.homeroomTeacherId,
    homeroomHeadteacherId: student.group?.homeroomHeadteacherId,
    counselorId: student.group?.counselorId,
  });
  if (ids.length === 0) return new Set();
  // Only staff with a linked user account can take part.
  const linked = await db.staffProfile.findMany({
    where: { id: { in: ids }, userId: { not: null } },
    select: { id: true },
  });
  return new Set(linked.map((s) => s.id));
}

async function reachableStaffList(db: Db, studentId: string) {
  const set = await reachableStaffSet(db, studentId);
  if (set.size === 0) return [];
  const staff = await db.staffProfile.findMany({
    where: { id: { in: [...set] } },
    select: { id: true, scheduleName: true, user: { select: { name: true } } },
  });
  return staff
    .map((s) => ({ id: s.id, name: staffDisplayName(s) }))
    .sort((a, b) => a.name.localeCompare(b.name, "el"));
}

// The student profiles a family user represents. Only PARENTS may start/hold
// threads with staff — students cannot message teachers (resolved 2026-06-11),
// so a student user resolves to no students even though they have a profile.
async function familyStudentIds(db: Db, userId: string): Promise<string[]> {
  const asParent = await db.parentProfile.findUnique({
    where: { userId },
    select: { children: { select: { studentProfileId: true } } },
  });
  const ids = new Set<string>();
  for (const c of asParent?.children ?? []) ids.add(c.studentProfileId);
  return [...ids];
}

async function myStaffId(db: Db, userId: string): Promise<string | null> {
  const sp = await db.staffProfile.findUnique({ where: { userId }, select: { id: true } });
  return sp?.id ?? null;
}

// Drop a bell notification for the other party when a message is sent.
// Best-effort — never block the message on a notification failure.
async function notifyNewMessage(
  db: Db,
  opts: { recipientUserId: string; senderName: string; body: string; linkUrl: string; senderId: string }
) {
  try {
    await db.notification.create({
      data: {
        userId: opts.recipientUserId,
        type: "MESSAGE",
        title: "Νέο μήνυμα",
        body: `${opts.senderName}: ${opts.body.slice(0, 80)}`,
        linkUrl: opts.linkUrl,
        read: false,
        senderId: opts.senderId,
      },
    });
  } catch (e) {
    logger.error({ event: "messages.notifyFailed", err: errInfo(e) }, "Message notification failed");
  }
}

// ── Router ────────────────────────────────────────────────────────────────────

export const messagesRouter = createTRPCRouter({
  // Recipients a parent/student may start a thread with, grouped by child.
  recipients: protectedProcedure.query(async ({ ctx }) => {
    const studentIds = await familyStudentIds(ctx.db, ctx.session.user.id);
    if (studentIds.length === 0) return [];
    const students = await ctx.db.studentProfile.findMany({
      where: { id: { in: studentIds } },
      select: { id: true, user: { select: { name: true } } },
    });
    return Promise.all(
      students.map(async (s) => ({
        studentId: s.id,
        studentName: s.user?.name ?? "—",
        staff: await reachableStaffList(ctx.db, s.id),
      }))
    );
  }),

  // A parent/student starts a thread to one staff member about a student.
  start: protectedProcedure
    .input(
      z.object({
        studentId: z.string(),
        staffId: z.string(),
        subject: z.string().trim().max(200).optional(),
        body: z.string().trim().min(1).max(5000),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const allowedStudents = await familyStudentIds(ctx.db, ctx.session.user.id);
      if (!allowedStudents.includes(input.studentId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Not your student" });
      }
      const reachable = await reachableStaffSet(ctx.db, input.studentId);
      if (!reachable.has(input.staffId)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Staff not reachable for this student" });
      }
      const now = new Date();
      const conv = await ctx.db.conversation.create({
        data: {
          studentId: input.studentId,
          staffId: input.staffId,
          starterId: ctx.session.user.id,
          subject: input.subject || null,
          lastMessageAt: now,
          familyReadAt: now,
          messages: { create: { authorId: ctx.session.user.id, body: input.body } },
        },
        select: { id: true, staff: { select: { userId: true } } },
      });

      // Notify the staff recipient (bell).
      if (conv.staff.userId) {
        await notifyNewMessage(ctx.db, {
          recipientUserId: conv.staff.userId,
          senderName: ctx.session.user.name ?? "—",
          body: input.body,
          linkUrl: "/teacher/messages",
          senderId: ctx.session.user.id,
        });
      }
      return { conversationId: conv.id };
    }),

  // Add a message to an existing thread (the family starter or the staff participant).
  reply: protectedProcedure
    .input(z.object({ conversationId: z.string(), body: z.string().trim().min(1).max(5000) }))
    .mutation(async ({ ctx, input }) => {
      const conv = await ctx.db.conversation.findUnique({
        where: { id: input.conversationId },
        select: {
          id: true,
          starterId: true,
          staff: { select: { userId: true } },
          starter: { select: { role: true } },
        },
      });
      if (!conv) throw new TRPCError({ code: "NOT_FOUND" });

      const isStarter = conv.starterId === ctx.session.user.id;
      const isStaffParticipant = conv.staff.userId === ctx.session.user.id;
      if (!isStarter && !isStaffParticipant) throw new TRPCError({ code: "FORBIDDEN" });

      const now = new Date();
      await ctx.db.$transaction([
        ctx.db.message.create({ data: { conversationId: conv.id, authorId: ctx.session.user.id, body: input.body } }),
        ctx.db.conversation.update({
          where: { id: conv.id },
          data: {
            lastMessageAt: now,
            // The sender has, by definition, seen everything up to now.
            ...(isStaffParticipant ? { staffReadAt: now } : { familyReadAt: now }),
          },
        }),
      ]);

      // Notify the other participant (bell).
      if (isStaffParticipant && conv.starterId) {
        await notifyNewMessage(ctx.db, {
          recipientUserId: conv.starterId,
          senderName: ctx.session.user.name ?? "—",
          body: input.body,
          linkUrl: conv.starter.role === "STUDENT" ? "/student/messages" : "/parent/messages",
          senderId: ctx.session.user.id,
        });
      } else if (isStarter && conv.staff.userId) {
        await notifyNewMessage(ctx.db, {
          recipientUserId: conv.staff.userId,
          senderName: ctx.session.user.name ?? "—",
          body: input.body,
          linkUrl: "/teacher/messages",
          senderId: ctx.session.user.id,
        });
      }
      return { ok: true };
    }),

  // The caller's inbox (family threads they started, or staff threads to them).
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const staffId = await myStaffId(ctx.db, userId);

    const convs = await ctx.db.conversation.findMany({
      where: { OR: [{ starterId: userId }, ...(staffId ? [{ staffId }] : [])] },
      orderBy: { lastMessageAt: "desc" },
      select: {
        id: true,
        subject: true,
        lastMessageAt: true,
        staffReadAt: true,
        familyReadAt: true,
        starterId: true,
        starter: { select: { name: true } },
        student: { select: { user: { select: { name: true } } } },
        staff: { select: { scheduleName: true, userId: true, user: { select: { name: true } } } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true } },
      },
    });

    return convs.map((c) => {
      const iAmStaff = !!staffId && c.staff.userId === userId;
      return {
        id: c.id,
        subject: c.subject,
        lastMessageAt: c.lastMessageAt,
        preview: c.messages[0]?.body ?? "",
        student: c.student.user?.name ?? "—",
        // Who the other party is, from the caller's perspective.
        counterpart: iAmStaff ? c.starter.name ?? "—" : staffDisplayName(c.staff),
        unread: iAmStaff
          ? isUnreadForStaff({ lastMessageAt: c.lastMessageAt, staffReadAt: c.staffReadAt })
          : isUnreadForFamily({ lastMessageAt: c.lastMessageAt, familyReadAt: c.familyReadAt }),
      };
    });
  }),

  // Unread thread count for the nav badge.
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const staffId = await myStaffId(ctx.db, userId);
    const convs = await ctx.db.conversation.findMany({
      where: { OR: [{ starterId: userId }, ...(staffId ? [{ staffId }] : [])] },
      select: {
        lastMessageAt: true,
        staffReadAt: true,
        familyReadAt: true,
        staff: { select: { userId: true } },
      },
    });
    return convs.filter((c) =>
      !!staffId && c.staff.userId === userId
        ? isUnreadForStaff({ lastMessageAt: c.lastMessageAt, staffReadAt: c.staffReadAt })
        : isUnreadForFamily({ lastMessageAt: c.lastMessageAt, familyReadAt: c.familyReadAt })
    ).length;
  }),

  // One thread's messages. Only the two participants may read; opening marks
  // it read for the participant viewing.
  thread: protectedProcedure
    .input(z.object({ conversationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const conv = await ctx.db.conversation.findUnique({
        where: { id: input.conversationId },
        select: {
          id: true,
          subject: true,
          starterId: true,
          starter: { select: { name: true } },
          student: { select: { user: { select: { name: true } } } },
          staff: { select: { id: true, userId: true, scheduleName: true, user: { select: { name: true } } } },
          messages: {
            orderBy: { createdAt: "asc" },
            select: { id: true, body: true, createdAt: true, authorId: true, author: { select: { name: true } } },
          },
        },
      });
      if (!conv) throw new TRPCError({ code: "NOT_FOUND" });

      const isStarter = conv.starterId === userId;
      const isStaffParticipant = conv.staff.userId === userId;
      if (!isStarter && !isStaffParticipant) throw new TRPCError({ code: "FORBIDDEN" });

      await ctx.db.conversation.update({
        where: { id: conv.id },
        data: isStaffParticipant ? { staffReadAt: new Date() } : { familyReadAt: new Date() },
      });

      return {
        id: conv.id,
        subject: conv.subject,
        student: conv.student.user?.name ?? "—",
        staffName: staffDisplayName(conv.staff),
        starterName: conv.starter.name ?? "—",
        canReply: true,
        messages: conv.messages.map((m) => ({
          id: m.id,
          body: m.body,
          createdAt: m.createdAt,
          authorName: m.author.name ?? "—",
          mine: m.authorId === userId,
        })),
      };
    }),
});
