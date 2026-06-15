import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, managementProcedure } from "../init";
import type { Context } from "../context";
import { sendSms, checkCredits } from "@/lib/sms";
import { dedupeByPhone, pickEncoding, smsSegmentInfo, type SmsEncoding } from "@/lib/smsText";
import { writeAudit } from "@/server/audit";

type Db = Context["db"];

// One recipient phone resolved from a student's active SMS contacts.
interface Target {
  contactId: string;
  phone: string;
  studentId: string;
  studentName: string;
}

const audienceInput = z.object({
  mode: z.enum(["students", "group", "grade", "school"]),
  studentIds: z.array(z.string()).optional(),
  groupId: z.string().optional(),
  grade: z.number().int().min(1).max(3).optional(),
});
type Audience = z.infer<typeof audienceInput>;

// Resolve an audience selection to the set of student profile ids it covers.
async function resolveStudentIds(db: Db, a: Audience): Promise<string[]> {
  if (a.mode === "students") {
    return [...new Set(a.studentIds ?? [])];
  }
  const where =
    a.mode === "group"
      ? a.groupId
        ? { groupId: a.groupId }
        : null
      : a.mode === "grade"
        ? a.grade
          ? { group: { grade: a.grade } }
          : null
        : {}; // school → all students
  if (where === null) return [];
  const rows = await db.studentProfile.findMany({ where, select: { id: true } });
  return rows.map((r) => r.id);
}

// Resolve students to their deduplicated active SMS recipients.
async function resolveTargets(db: Db, studentIds: string[]): Promise<Target[]> {
  if (studentIds.length === 0) return [];
  const students = await db.studentProfile.findMany({
    where: { id: { in: studentIds } },
    select: {
      id: true,
      user: { select: { name: true } },
      smsContacts: { where: { active: true }, select: { id: true, phone: true } },
    },
  });
  const targets: Target[] = [];
  for (const s of students) {
    for (const c of s.smsContacts) {
      targets.push({ contactId: c.id, phone: c.phone, studentId: s.id, studentName: s.user?.name ?? "—" });
    }
  }
  return dedupeByPhone(targets);
}

export const smsRouter = createTRPCRouter({
  // Live account credit balance for the console header.
  credits: managementProcedure.query(async () => {
    return checkCredits(); // { credits } | null
  }),

  // Pickable audiences: homegroups (with student counts) and grades.
  audiences: managementProcedure.query(async ({ ctx }) => {
    const [groups, schoolTotal] = await Promise.all([
      ctx.db.group.findMany({
        where: { students: { some: {} } },
        select: { id: true, name: true, grade: true, _count: { select: { students: true } } },
        orderBy: [{ grade: "asc" }, { name: "asc" }],
      }),
      ctx.db.studentProfile.count(),
    ]);
    const grades = [...new Set(groups.map((g) => g.grade))].sort((a, b) => a - b);
    return {
      groups: groups.map((g) => ({ id: g.id, name: g.name, grade: g.grade, students: g._count.students })),
      grades,
      schoolTotal,
    };
  }),

  // All students for the browse-and-tick individual picker, ordered by year,
  // then class, then name so the client can group them under class headings.
  allStudents: managementProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.studentProfile.findMany({
      select: { id: true, user: { select: { name: true } }, group: { select: { name: true, grade: true } } },
    });
    return rows
      .map((r) => ({
        id: r.id,
        name: r.user?.name ?? "—",
        group: r.group?.name ?? null,
        grade: r.group?.grade ?? null,
      }))
      .sort(
        (a, b) =>
          (a.grade ?? 99) - (b.grade ?? 99) ||
          (a.group ?? "").localeCompare(b.group ?? "", "el") ||
          a.name.localeCompare(b.name, "el")
      );
  }),

  // Count students + distinct phones an audience resolves to, before sending.
  preview: managementProcedure.input(audienceInput).query(async ({ ctx, input }) => {
    const studentIds = await resolveStudentIds(ctx.db, input);
    const targets = await resolveTargets(ctx.db, studentIds);
    return { students: studentIds.length, recipients: targets.length };
  }),

  // Send a message to the resolved audience. One SMS per distinct phone; each is
  // logged to SmsLog and the batch is audited.
  send: managementProcedure
    .input(audienceInput.extend({ message: z.string().trim().min(1).max(700), encoding: z.enum(["GSM", "UCS2"]).optional() }))
    .mutation(async ({ ctx, input }) => {
      const studentIds = await resolveStudentIds(ctx.db, input);
      const targets = await resolveTargets(ctx.db, studentIds);
      if (targets.length === 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No recipients with an active SMS number" });
      }

      const encoding: SmsEncoding = input.encoding ?? pickEncoding(input.message);
      const seg = smsSegmentInfo(input.message, encoding);
      if (seg.overLimit) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Message exceeds 3 SMS segments" });
      }

      // Send in small parallel batches so a whole-school broadcast (~1000 phones)
      // completes in seconds rather than minutes, without flooding the gateway.
      const BATCH = 15;
      const logs: {
        studentId: string;
        smsContactId: string;
        phoneNumber: string;
        message: string;
        status: string;
        gatewayResponse: string | undefined;
      }[] = [];
      let sent = 0;
      for (let i = 0; i < targets.length; i += BATCH) {
        const slice = targets.slice(i, i + BATCH);
        const outcomes = await Promise.all(
          slice.map(async (t) => ({ t, r: await sendSms(t.phone, input.message, { encoding }) }))
        );
        for (const { t, r } of outcomes) {
          if (r.success) sent++;
          logs.push({
            studentId: t.studentId,
            smsContactId: t.contactId,
            phoneNumber: t.phone,
            message: input.message,
            status: r.success ? "SENT" : "FAILED",
            gatewayResponse: r.gatewayResponse ?? r.error,
          });
        }
      }
      await ctx.db.smsLog.createMany({ data: logs });

      await writeAudit({
        userId: ctx.session.user.id,
        action: "sms.broadcast",
        resource: "SmsLog",
        details: { mode: input.mode, recipients: targets.length, sent, failed: targets.length - sent, encoding },
      });

      return { recipients: targets.length, sent, failed: targets.length - sent };
    }),

  // Recent send history for the console.
  history: managementProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.smsLog.findMany({
      orderBy: { sentAt: "desc" },
      take: 30,
      select: {
        id: true,
        phoneNumber: true,
        message: true,
        status: true,
        sentAt: true,
        student: { select: { user: { select: { name: true } } } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      phone: r.phoneNumber,
      message: r.message,
      status: r.status,
      sentAt: r.sentAt,
      student: r.student.user?.name ?? "—",
    }));
  }),
});
