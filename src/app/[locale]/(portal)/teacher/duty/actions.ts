"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";
import { dutyDowFor, isOnDuty } from "@/lib/dutyRoster";
import { permitAbsenceSlots } from "@/lib/exitPermit";
import { utcMidnight } from "@/lib/dates";

// Only TODAY'S rostered on-duty deputy may issue/cancel exit permits.
async function requireOnDutyDeputy() {
  const auth = await getActiveAuth();
  if (!auth) return null;
  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: { id: true },
  });
  if (!staff) return null;
  const today = utcMidnight();
  const dow = dutyDowFor(today);
  if (!dow) return null;
  const entries = await db.dutyRosterEntry.findMany({
    where: { dayOfWeek: dow },
    select: { dayOfWeek: true, staffProfileId: true },
  });
  if (!isOnDuty(entries, dow, staff.id)) return null;
  return { auth, staff, today };
}

// Locator filters travel through the form so the desk keeps its state after a
// redirect (picking another student from the same group stays two clicks away).
function deskQs(formData: FormData, extra: Record<string, string>): string {
  const sp = new URLSearchParams();
  for (const key of ["tab", "grade", "groupId", "q"]) {
    const v = ((formData.get(key) as string) ?? "").trim();
    if (v) sp.set(key, v);
  }
  for (const [k, v] of Object.entries(extra)) {
    if (v) sp.set(k, v);
  }
  return sp.toString();
}

export async function issueExitPermit(locale: string, formData: FormData) {
  const base = `/${locale}/teacher/duty`;
  const studentId = ((formData.get("studentId") as string) ?? "").trim();
  const fromPeriod = parseInt((formData.get("fromPeriod") as string) ?? "");
  const reason = ((formData.get("reason") as string) ?? "").trim();
  const smsContactId = ((formData.get("smsContactId") as string) ?? "").trim();
  const contactNote = ((formData.get("contactNote") as string) ?? "").trim();

  const ctx = await requireOnDutyDeputy();
  if (!ctx) redirect(`${base}?${deskQs(formData, { error: "errNotOnDuty" })}`);

  if (!Number.isInteger(fromPeriod) || fromPeriod < 1 || fromPeriod > 8) {
    redirect(`${base}?${deskQs(formData, { student: studentId, error: "errPeriod" })}`);
  }
  if (!reason) {
    redirect(`${base}?${deskQs(formData, { student: studentId, error: "errReason" })}`);
  }

  const student = await db.studentProfile.findFirst({
    where: { id: studentId, user: { isActive: true } },
    select: {
      id: true,
      groupId: true,
      subjectGroups: { select: { groupId: true } },
      smsContacts: { where: { active: true }, select: { id: true } },
    },
  });
  if (!student) redirect(`${base}?${deskQs(formData, { error: "errStudent" })}`);

  // The deputy must record who agreed: a picked contact when the student has
  // contacts on record, otherwise the free-text note.
  if (student.smsContacts.length > 0) {
    if (!student.smsContacts.some((c) => c.id === smsContactId)) {
      redirect(`${base}?${deskQs(formData, { student: studentId, error: "errContact" })}`);
    }
  } else if (!contactNote) {
    redirect(`${base}?${deskQs(formData, { student: studentId, error: "errContact" })}`);
  }

  // The student's remaining periods today (homegroup + subject groups; the
  // subject-group slot wins a shared period) get pre-marked ABSENT and linked
  // to the permit, so schedules/locate show them yellow right away.
  const dow = dutyDowFor(ctx.today)!; // requireOnDutyDeputy guarantees a school day
  const groupIds = [
    ...new Set([
      ...(student.groupId ? [student.groupId] : []),
      ...student.subjectGroups.map((sg) => sg.groupId),
    ]),
  ];
  const slots = groupIds.length
    ? await db.timetableSlot.findMany({
        where: { groupId: { in: groupIds }, dayOfWeek: dow, period: { gte: fromPeriod } },
        select: { id: true, groupId: true, period: true },
      })
    : [];
  const absenceSlots = permitAbsenceSlots(slots, student.groupId);

  const permit = await db.$transaction(async (tx) => {
    const created = await tx.exitPermit.create({
      data: {
        studentId: student.id,
        issuerId: ctx.staff.id,
        date: ctx.today,
        fromPeriod,
        reason,
        smsContactId: smsContactId || null,
        contactNote: contactNote || null,
      },
    });
    for (const slot of absenceSlots) {
      await tx.attendance.upsert({
        where: {
          studentId_timetableSlotId_date: {
            studentId: student.id,
            timetableSlotId: slot.id,
            date: ctx.today,
          },
        },
        create: {
          studentId: student.id,
          timetableSlotId: slot.id,
          staffId: ctx.staff.id,
          date: ctx.today,
          status: "ABSENT",
          exitPermitId: created.id,
        },
        update: { status: "ABSENT", exitPermitId: created.id },
      });
    }
    return created;
  });

  await writeAudit({
    userId: ctx.auth.userId,
    action: "permit.issue",
    resource: "ExitPermit",
    resourceId: permit.id,
    details: { studentId: student.id, fromPeriod },
    ...(await requestMeta()),
  });
  revalidatePath("/[locale]/(portal)/teacher/duty", "page");
  // Straight to the printable slip; `back` carries the desk filters home.
  const back = deskQs(formData, {});
  redirect(
    `${base}/permits/${permit.id}/print?auto=1${back ? `&back=${encodeURIComponent(back)}` : ""}`
  );
}

export async function cancelExitPermit(locale: string, permitId: string, returnQs: string) {
  const back = `/${locale}/teacher/duty${returnQs ? `?${returnQs}` : ""}`;
  const ctx = await requireOnDutyDeputy();
  if (!ctx) redirect(back);

  // Only today's permits can be cancelled (yesterday's are history).
  const permit = await db.exitPermit.findFirst({
    where: { id: permitId, date: ctx.today },
  });
  if (!permit) redirect(back);

  // A cancelled permit is removed outright, along with its pre-marked
  // absences — the audit log keeps the trace.
  await db.$transaction([
    db.attendance.deleteMany({ where: { exitPermitId: permit.id } }),
    db.exitPermit.delete({ where: { id: permit.id } }),
  ]);
  await writeAudit({
    userId: ctx.auth.userId,
    action: "permit.cancel",
    resource: "ExitPermit",
    resourceId: permit.id,
    details: { studentId: permit.studentId, fromPeriod: permit.fromPeriod, reason: permit.reason },
    ...(await requestMeta()),
  });
  revalidatePath("/[locale]/(portal)/teacher/duty", "page");
  redirect(back);
}
