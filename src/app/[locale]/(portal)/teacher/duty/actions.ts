"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";
import { canIssueExitPermit, dutyDowFor } from "@/lib/dutyRoster";
import { permitAbsenceSlots, permitAccountNote } from "@/lib/exitPermit";
import { utcMidnight } from "@/lib/dates";
import { parentAccountPhones, permitPhoneChoices } from "@/lib/smsContacts";

// Any headteacher may issue/cancel exit permits on a school day, on duty or not.
async function requirePermitIssuer() {
  const auth = await getActiveAuth();
  if (!auth) return null;
  const today = utcMidnight();
  if (!canIssueExitPermit(auth.role, dutyDowFor(today))) return null;
  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: { id: true },
  });
  if (!staff) return null;
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

  const ctx = await requirePermitIssuer();
  if (!ctx) redirect(`${base}?${deskQs(formData, { error: "errNotPermitIssuer" })}`);

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
      smsContacts: { select: { id: true, name: true, phone: true, role: true, isDefault: true } },
      parents: { select: { parentProfile: { select: { id: true, phone: true, role: true, user: { select: { name: true } } } } } },
    },
  });
  if (!student) redirect(`${base}?${deskQs(formData, { error: "errStudent" })}`);

  // The deputy must record who agreed: one of the numbers the picker offers —
  // an imported contact (any of them, active or not) or a linked parent
  // account's phone — otherwise the free-text note.
  const choices = permitPhoneChoices(student.smsContacts, parentAccountPhones(student.parents));
  const picked = choices.find((c) => c.value === smsContactId);
  let savedContactId: string | null = null;
  let savedNote: string | null = contactNote || null;
  if (choices.length > 0) {
    if (!picked) {
      redirect(`${base}?${deskQs(formData, { student: studentId, error: "errContact" })}`);
    }
    if (picked.kind === "account") savedNote = permitAccountNote(picked);
    else savedContactId = picked.value;
  } else if (!contactNote) {
    redirect(`${base}?${deskQs(formData, { student: studentId, error: "errContact" })}`);
  }

  // The student's remaining periods today (homegroup + subject groups; the
  // subject-group slot wins a shared period) get pre-marked ABSENT and linked
  // to the permit, so schedules/locate show them yellow right away.
  const dow = dutyDowFor(ctx.today)!; // requirePermitIssuer guarantees a school day
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
        smsContactId: savedContactId,
        contactNote: savedNote,
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
  const ctx = await requirePermitIssuer();
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
