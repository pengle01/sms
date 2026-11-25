"use server";

import * as XLSX from "xlsx";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getActiveAuth } from "@/server/authz";
import { writeAudit, requestMeta } from "@/server/audit";
import { logger, errInfo } from "@/server/logger";
import { utcMidnight, fmtDisplayDate } from "@/lib/dates";
import { canManageSpecialEdRegister } from "@/lib/specialEd";
import { matchTranscribers, parseTranscriberRows, transcriberTestLine } from "@/lib/transcribers";
import { loadTranscriberDay, transcriberBusy, transcriberStudentsForGroup } from "@/server/transcribers";
import { getRooms } from "@/server/rooms";
import { dutyDowFor } from "@/lib/dutyRoster";

/**
 * «Μεταγραφείς» belongs to the deputy responsible for special education, with
 * the headmaster and system admin as a fallback. The session decides.
 */
async function requireAccess() {
  const auth = await getActiveAuth();
  if (!auth) redirect("/");
  const staff = await db.staffProfile.findUnique({
    where: { userId: auth.userId },
    select: { specialEducation: true },
  });
  if (!canManageSpecialEdRegister(auth.roles, !!staff?.specialEducation)) redirect("/");
  return auth;
}

export type TranscriberUploadResult =
  | { ok: true; transcribers: number; unmatched: string[]; repeated: string[] }
  | { ok: false; error: "noFile" | "noNameColumn" | "empty" | "noneMatched" };

/**
 * The uploaded sheet («ΜΕΤΑΓΡΑΦΕΙΣ», «ΠΕΡΙΟΔΟΙ») becomes the whole list of
 * transcribers. A sheet matching no teacher is refused rather than emptying
 * the list. Assignments already made stay as they are.
 */
export async function uploadTranscribers(
  _prev: TranscriberUploadResult | null,
  formData: FormData,
): Promise<TranscriberUploadResult> {
  const auth = await requireAccess();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "noFile" };

  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, defval: "" });
  const parsed = parseTranscriberRows(rows);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const staff = await db.staffProfile.findMany({
    where: { scheduleName: { not: null }, leftTimetableAt: null },
    select: { id: true, scheduleName: true },
  });
  const { matched, unmatched, repeated } = matchTranscribers(parsed.entries, staff);
  if (matched.length === 0) return { ok: false, error: "noneMatched" };

  await db.$transaction([
    db.staffProfile.updateMany({ where: { transcriber: true }, data: { transcriber: false, transcriberPeriods: null } }),
    ...matched.map((m) =>
      db.staffProfile.update({ where: { id: m.staffId }, data: { transcriber: true, transcriberPeriods: m.periods } }),
    ),
  ]);
  await writeAudit({
    ...(await requestMeta()),
    userId: auth.userId,
    action: "transcriber.listUpload",
    resource: "StaffProfile",
    details: { transcribers: matched.length, unmatched: unmatched.length, repeated: repeated.length },
  });
  revalidatePath("/[locale]/teacher/special-ed/transcribers", "page");
  return { ok: true, transcribers: matched.length, unmatched, repeated };
}

/** Best effort: a failed notice never undoes the assignment. */
async function notify(rows: { userId: string | null | undefined; type: string; title: string; body: string; linkUrl: string }[], senderId: string) {
  const data = rows.flatMap((r) => (r.userId && r.userId !== senderId ? [{ ...r, userId: r.userId, senderId, read: false }] : []));
  if (data.length === 0) return;
  try {
    await db.notification.createMany({ data });
  } catch (e) {
    logger.error({ event: "transcriber.notifyFailed", err: errInfo(e) }, "Transcriber notification failed");
  }
}

export type AssignTranscriberResult = { ok: true } | { ok: false; error: "gone" | "past" | "notEntitled" | "notListed" | "busy" | "noRoom" };

/**
 * Pick (or change) the transcriber of one student for one test, and the room
 * they sit it in. A room already in use may still be chosen — the page warns.
 */
export async function assignTranscriber(
  testId: string,
  studentId: string,
  staffId: string,
  room: string,
): Promise<AssignTranscriberResult> {
  const auth = await requireAccess();
  if (!(await getRooms()).some((r) => r.name === room)) return { ok: false, error: "noRoom" };

  const test = await db.testSchedule.findUnique({
    where: { id: testId },
    include: {
      course: { select: { name: true } },
      group: { select: { name: true } },
      staff: { select: { userId: true } },
      transcribers: { where: { studentId }, select: { staffId: true, room: true, staff: { select: { userId: true } } } },
    },
  });
  if (!test) return { ok: false, error: "gone" };
  if (test.date < utcMidnight()) return { ok: false, error: "past" };

  const student = (await transcriberStudentsForGroup(test.groupId)).find((s) => s.id === studentId);
  if (!student) return { ok: false, error: "notEntitled" };

  const staff = await db.staffProfile.findFirst({
    where: { id: staffId, transcriber: true, leftTimetableAt: null },
    select: { id: true, userId: true, scheduleName: true },
  });
  if (!staff || staff.id === test.staffId) return { ok: false, error: "notListed" };

  const day = await loadTranscriberDay(test.date, [staff.id]);
  if (transcriberBusy(day, staff.id, test, studentId) !== null) return { ok: false, error: "busy" };

  const previous = test.transcribers[0] ?? null;
  const sameTeacher = previous?.staffId === staff.id;
  if (sameTeacher && previous.room === room) return { ok: true };

  await db.testTranscriber.upsert({
    where: { testId_studentId: { testId, studentId } },
    create: { testId, studentId, staffId: staff.id, room, assignedById: auth.userId },
    update: { staffId: staff.id, room, assignedById: auth.userId },
  });
  await writeAudit({
    ...(await requestMeta()),
    userId: auth.userId,
    action: "transcriber.assign",
    resource: "TestTranscriber",
    resourceId: testId,
    details: { studentId, staffId: staff.id, room, replaced: sameTeacher ? null : (previous?.staffId ?? null) },
  });

  const line = transcriberTestLine({
    dateLabel: fmtDisplayDate(test.date),
    period: test.period,
    periodCount: test.periodCount,
    courseName: test.course.name,
    groupName: test.group.name,
  });
  const name = student.user?.name ?? "";
  // The room the class itself sits the test in — the transcriber collects the student there.
  const dow = dutyDowFor(test.date);
  const classSlot = dow
    ? await db.timetableSlot.findFirst({
        where: { groupId: test.groupId, dayOfWeek: dow, period: test.period },
        select: { room: true },
      })
    : null;
  const classRoom = classSlot?.room ? ` · Αίθουσα τμήματος ${classSlot.room}` : "";
  await notify(
    [
      {
        userId: staff.userId,
        type: "TRANSCRIBER_ASSIGNED",
        title: sameTeacher ? "Μεταγραφή: άλλαξε η αίθουσα" : "Ορίστηκες μεταγραφέας σε διαγώνισμα",
        body: `${line} · ${name} · Αίθουσα μεταγραφής ${room}${classRoom}`,
        linkUrl: "/teacher/dashboard",
      },
      {
        userId: test.staff.userId,
        type: "TRANSCRIBER_ASSIGNED",
        title: "Ορίστηκε μεταγραφέας στο διαγώνισμά σου",
        body: `${line} · ${name} · ${staff.scheduleName ?? ""} · Αίθουσα ${room}`,
        linkUrl: "/teacher/tests",
      },
      ...(previous && !sameTeacher
        ? [
            {
              userId: previous.staff.userId,
              type: "TRANSCRIBER_CANCELLED",
              title: "Δεν είσαι πλέον μεταγραφέας σε διαγώνισμα",
              body: `${line} · ${name}`,
              linkUrl: "/teacher/dashboard",
            },
          ]
        : []),
    ],
    auth.userId,
  );

  revalidatePath("/[locale]/teacher/special-ed/transcribers", "page");
  return { ok: true };
}

/** Take the transcriber off one student's test; the need goes back to pending. */
export async function removeTranscriber(testId: string, studentId: string): Promise<void> {
  const auth = await requireAccess();
  const row = await db.testTranscriber.findUnique({
    where: { testId_studentId: { testId, studentId } },
    select: {
      id: true,
      staffId: true,
      staff: { select: { userId: true } },
      student: { select: { user: { select: { name: true } } } },
      test: {
        select: { date: true, period: true, periodCount: true, course: { select: { name: true } }, group: { select: { name: true } } },
      },
    },
  });
  if (!row) return;

  await db.testTranscriber.delete({ where: { id: row.id } });
  await writeAudit({
    ...(await requestMeta()),
    userId: auth.userId,
    action: "transcriber.remove",
    resource: "TestTranscriber",
    resourceId: testId,
    details: { studentId, staffId: row.staffId },
  });
  const line = transcriberTestLine({
    dateLabel: fmtDisplayDate(row.test.date),
    period: row.test.period,
    periodCount: row.test.periodCount,
    courseName: row.test.course.name,
    groupName: row.test.group.name,
  });
  await notify(
    [
      {
        userId: row.staff.userId,
        type: "TRANSCRIBER_CANCELLED",
        title: "Δεν είσαι πλέον μεταγραφέας σε διαγώνισμα",
        body: `${line} · ${row.student.user?.name ?? ""}`,
        linkUrl: "/teacher/dashboard",
      },
    ],
    auth.userId,
  );
  revalidatePath("/[locale]/teacher/special-ed/transcribers", "page");
}
