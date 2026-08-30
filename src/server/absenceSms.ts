import { db } from "@/server/db";
import { logger } from "@/server/logger";
import { writeAudit } from "@/server/audit";
import { sendSms } from "@/lib/sms";
import { dedupeByPhone, pickEncoding } from "@/lib/smsText";
import { getAbsenceSmsConfig } from "@/lib/schoolConfig";
import { getNow, localDateStr, fmtDisplayDate } from "@/lib/dates";
import { renderAbsenceSms, shouldSendAbsenceSms } from "@/lib/absenceSms";

/** Matches the SMS console's fan-out, so one slow gateway cannot stall a class. */
const BATCH = 15;

type MarkedRow = {
  id: string;
  studentId: string;
  date: Date;
  status: string;
  smsSent: boolean;
};

/**
 * Text the parents of students marked absent in the first period.
 *
 * Called from markAttendance on the request path, so it is written to fail
 * quietly: every error is caught and logged, and the teacher's save is never
 * affected by the state of the SMS gateway. `smsSent` is set only for a student
 * whose message actually left, so an outage leaves the row retryable instead of
 * silently swallowing the notification — which is exactly what the old stub did.
 */
export async function sendAbsenceSms(rows: MarkedRow[], actorUserId: string): Promise<void> {
  try {
    const config = await getAbsenceSmsConfig();
    if (!config.enabled) return;

    const now = getNow();
    const todayIso = localDateStr(now);

    const due = rows.filter((r) =>
      shouldSendAbsenceSms({
        config,
        attendanceDateIso: localDateStr(r.date),
        todayIso,
        now,
        status: r.status,
        alreadySent: r.smsSent,
      }),
    );
    if (due.length === 0) return;

    const students = await db.studentProfile.findMany({
      where: { id: { in: due.map((r) => r.studentId) } },
      select: {
        id: true,
        user: { select: { name: true } },
        smsContacts: { where: { active: true }, select: { id: true, phone: true } },
      },
    });

    // One target per (student, phone). Same rule the SMS console uses: every
    // active number for the student, de-duplicated.
    const targets = students.flatMap((s) => {
      const message = renderAbsenceSms(config.template, {
        name: s.user?.name ?? "",
        date: fmtDisplayDate(due.find((r) => r.studentId === s.id)!.date),
      });
      return dedupeByPhone(s.smsContacts.map((c) => ({ ...c, phone: c.phone }))).map((c) => ({
        studentId: s.id,
        contactId: c.id,
        phone: c.phone,
        message,
      }));
    });

    if (targets.length === 0) {
      logger.warn(
        { event: "absenceSms.noRecipients", students: due.length },
        "First-period absences with no active SMS number",
      );
      return;
    }

    const logs: {
      studentId: string;
      smsContactId: string;
      phoneNumber: string;
      message: string;
      status: string;
      gatewayResponse?: string;
      sentById: string;
      kind: "ABSENCE";
    }[] = [];
    const delivered = new Set<string>();

    for (let i = 0; i < targets.length; i += BATCH) {
      const slice = targets.slice(i, i + BATCH);
      const results = await Promise.all(
        slice.map(async (t) => ({
          t,
          r: await sendSms(t.phone, t.message, { encoding: pickEncoding(t.message) }),
        })),
      );
      for (const { t, r } of results) {
        if (r.success) delivered.add(t.studentId);
        logs.push({
          studentId: t.studentId,
          smsContactId: t.contactId,
          phoneNumber: t.phone,
          message: t.message,
          status: r.success ? "SENT" : "FAILED",
          gatewayResponse: r.gatewayResponse ?? r.error,
          // The teacher whose register triggered it. kind: ABSENCE marks it
          // automatic, so the log does not read as a text they chose to send.
          sentById: actorUserId,
          kind: "ABSENCE",
        });
      }
    }

    if (logs.length > 0) await db.smsLog.createMany({ data: logs });

    // Only the students actually reached — a failure stays retryable.
    if (delivered.size > 0) {
      await db.attendance.updateMany({
        where: { id: { in: due.filter((r) => delivered.has(r.studentId)).map((r) => r.id) } },
        data: { smsSent: true },
      });
    }

    await writeAudit({
      userId: actorUserId,
      action: "attendance.absenceSms",
      resource: "SmsLog",
      details: {
        students: due.length,
        messages: logs.length,
        sent: logs.filter((l) => l.status === "SENT").length,
        failed: logs.filter((l) => l.status === "FAILED").length,
      },
    });
  } catch (err) {
    // Deliberately swallowed: the register is already saved and matters more.
    logger.error(
      { event: "absenceSms.failed", err: err instanceof Error ? err.message : String(err) },
      "Absence SMS failed",
    );
  }
}
