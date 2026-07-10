// Substitution plan lifecycle: gather data → run the pure engine → persist.
// Only FINAL plans affect schedules and notify substitutes.

import { db } from "@/server/db";
import { writeAudit, requestMeta } from "@/server/audit";
import { getPeriodsPerDay, getSchoolYear } from "@/lib/schoolConfig";
import { getOnDutyDeputies } from "@/lib/calendar";
import { dutyDowFor } from "@/lib/dutyRoster";
import { fmtDisplayDate } from "@/lib/dates";
import { getRooms } from "@/server/rooms";
import {
  buildPlan,
  lastPeriodFor,
  type SubRequest,
  type SubSlot,
  type SubTeacher,
} from "@/lib/substitutions";

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The coordinator's staff profile, or null when the user lacks the designation. */
export async function getCoordinatorStaff(userId: string) {
  const staff = await db.staffProfile.findUnique({
    where: { userId },
    select: { id: true, substitutionCoordinator: true },
  });
  return staff?.substitutionCoordinator ? staff : null;
}

/** Requests possibly touching a date (engine re-filters precisely). */
function requestsWhere(date: Date) {
  return {
    OR: [
      { startDate: date },
      { AND: [{ startDate: { lte: date } }, { endDate: { gte: date } }] },
    ],
  };
}

async function loadEngineInput(date: Date) {
  const dow = dutyDowFor(date);
  if (!dow) return null; // weekend

  const [periodsConfig, schoolYear, slotRows, staffRows, requestRows, roomRows] = await Promise.all([
    getPeriodsPerDay(),
    getSchoolYear(),
    db.timetableSlot.findMany({
      where: { dayOfWeek: dow },
      include: {
        group: { select: { name: true } },
        course: { select: { name: true } },
        staff: { select: { id: true, scheduleName: true } },
      },
    }),
    db.staffProfile.findMany({
      where: { userId: { not: null }, user: { is: { isActive: true } } },
      select: { id: true, scheduleName: true, maxSubstitutions: true },
    }),
    db.substitutionRequest.findMany({ where: requestsWhere(date) }),
    getRooms(),
  ]);

  // Substitution history from FINAL plans (excluding this date itself)
  const weekAgo = new Date(date.getTime() - 7 * 86_400_000);
  const history = await db.substitutionPlanEntry.findMany({
    where: {
      kind: { in: ["COVER", "SWAP"] },
      substituteStaffId: { not: null },
      plan: { status: "FINAL", date: { gte: schoolYear.yearStart, not: date } },
    },
    select: { substituteStaffId: true, plan: { select: { date: true } } },
  });
  const yearCount = new Map<string, number>();
  const recentCount = new Map<string, number>();
  for (const h of history) {
    const id = h.substituteStaffId!;
    yearCount.set(id, (yearCount.get(id) ?? 0) + 1);
    if (h.plan.date >= weekAgo) recentCount.set(id, (recentCount.get(id) ?? 0) + 1);
  }

  const slots: SubSlot[] = slotRows.map((s) => ({
    slotId: s.id,
    staffId: s.staffId,
    scheduleName: s.staff?.scheduleName ?? s.staffName ?? "",
    period: s.period,
    groupId: s.groupId,
    groupName: s.group.name,
    room: s.room,
    courseName: s.course.name,
  }));

  const teachers: SubTeacher[] = staffRows.map((t) => ({
    staffId: t.id,
    scheduleName: t.scheduleName ?? "",
    maxSubstitutions: t.maxSubstitutions,
    yearCount: yearCount.get(t.id) ?? 0,
    recentCount: recentCount.get(t.id) ?? 0,
  }));

  const requests: SubRequest[] = requestRows.map((r) => ({
    id: r.id,
    staffId: r.staffId,
    type: r.type,
    startDate: iso(r.startDate),
    endDate: r.endDate ? iso(r.endDate) : null,
    periods: r.periods,
    reason: r.reasonDetails ? `${r.reason ?? ""} — ${r.reasonDetails}`.trim() : r.reason,
    groupId: r.groupId,
    newRoom: r.newRoom,
  }));

  return {
    dateIso: iso(date),
    dow,
    lastPeriod: lastPeriodFor(dow, periodsConfig),
    slots,
    teachers,
    requests,
    rooms: roomRows.map(({ name, capacity }) => ({ name, capacity })),
  };
}

/** (Re)generate the date's plan as a DRAFT, replacing any previous entries. */
export async function generatePlan(date: Date, userId: string) {
  const input = await loadEngineInput(date);
  if (!input) return { ok: false as const, error: "weekend" };

  const entries = buildPlan(input);

  await db.$transaction(async (tx) => {
    const plan = await tx.substitutionPlan.upsert({
      where: { date },
      create: { date, status: "DRAFT", generatedById: userId },
      update: { status: "DRAFT", generatedById: userId, finalizedById: null, finalizedAt: null },
    });
    await tx.substitutionPlanEntry.deleteMany({ where: { planId: plan.id } });
    if (entries.length > 0) {
      await tx.substitutionPlanEntry.createMany({
        data: entries.map((e) => ({ planId: plan.id, ...e })),
      });
    }
  });

  await writeAudit({
    userId,
    action: "substitution.generate",
    resource: "SubstitutionPlan",
    resourceId: iso(date),
    details: { entries: entries.length },
    ...(await requestMeta()),
  });
  return { ok: true as const, entries: entries.length };
}

/** Finalize the date's draft: schedules now reflect it; substitutes are notified. */
export async function finalizePlan(date: Date, userId: string) {
  const plan = await db.substitutionPlan.findUnique({
    where: { date },
    include: {
      entries: {
        include: {
          group: { select: { name: true } },
          substituteStaff: { select: { userId: true } },
          timetableSlot: { include: { course: { select: { name: true } } } },
        },
      },
    },
  });
  if (!plan) return { ok: false as const, error: "noplan" };
  if (plan.status === "FINAL") return { ok: false as const, error: "alreadyFinal" };

  const dateLabel = fmtDisplayDate(date);

  // One notification per substitute, listing all their assignments for the day
  const bySubUser = new Map<string, string[]>();
  for (const e of plan.entries) {
    if ((e.kind === "COVER" || e.kind === "SWAP") && e.substituteStaff?.userId) {
      const line = `Π${e.period} ${e.group?.name ?? ""}${e.newRoom ? ` (αίθ. ${e.newRoom})` : ""}`;
      const list = bySubUser.get(e.substituteStaff.userId) ?? [];
      list.push(line);
      bySubUser.set(e.substituteStaff.userId, list);
    }
  }

  // Study halls go to the day's on-duty deputies
  const studyHalls = plan.entries.filter((e) => e.kind === "STUDY_HALL");
  const deputies = studyHalls.length > 0 ? await getOnDutyDeputies(date) : [];

  let finalized = false;
  await db.$transaction(async (tx) => {
    // Atomic guard: only one finalize wins, even on double submission.
    const res = await tx.substitutionPlan.updateMany({
      where: { id: plan.id, status: "DRAFT" },
      data: { status: "FINAL", finalizedById: userId, finalizedAt: new Date() },
    });
    if (res.count === 0) return; // someone else finalized meanwhile
    finalized = true;

    // Re-finalizing a regenerated plan must REPLACE the previous batch, not
    // stack on top of it — drop this date's old substitution notifications.
    await tx.notification.deleteMany({
      where: {
        type: { in: ["SUBSTITUTION_ASSIGNED", "SUBSTITUTION_STUDY_HALL"] },
        title: { endsWith: dateLabel },
      },
    });

    for (const [subUserId, lines] of bySubUser) {
      await tx.notification.create({
        data: {
          userId: subUserId,
          type: "SUBSTITUTION_ASSIGNED",
          title: `Αναπλήρωση ${dateLabel}`,
          body: lines.join(" · "),
          linkUrl: `/teacher/dashboard`,
          read: false,
        },
      });
    }

    const notifiedDeputies = new Set<string>();
    for (const d of deputies) {
      const deputyUserId = d.staffProfile.user?.id;
      if (!deputyUserId || notifiedDeputies.has(deputyUserId)) continue;
      notifiedDeputies.add(deputyUserId);
      await tx.notification.create({
        data: {
          userId: deputyUserId,
          type: "SUBSTITUTION_STUDY_HALL",
          title: `Φ/δι εφημερίας ${dateLabel}`,
          body: studyHalls
            .map((e) => `Π${e.period} ${e.group?.name ?? ""}`)
            .join(" · "),
          linkUrl: `/teacher/dashboard`,
          read: false,
        },
      });
    }
  });
  if (!finalized) return { ok: false as const, error: "alreadyFinal" };

  await writeAudit({
    userId,
    action: "substitution.finalize",
    resource: "SubstitutionPlan",
    resourceId: iso(date),
    details: { entries: plan.entries.length, notified: bySubUser.size },
    ...(await requestMeta()),
  });
  return { ok: true as const };
}

// ── Read API for the schedule surfaces ───────────────────────────────────────

export type DayOverrideEntry = NonNullable<
  Awaited<ReturnType<typeof getDayOverrides>>
>["entries"][number];

/**
 * The FINAL plan's entries for a date (null when there is no finalized plan).
 * Single read API used by the dashboard, schedule grids, marking, student
 * schedule and locate.
 */
export async function getDayOverrides(date: Date) {
  const plan = await db.substitutionPlan.findFirst({
    where: { date, status: "FINAL" },
    include: {
      entries: {
        include: {
          group: { select: { id: true, name: true } },
          absentStaff: { select: { id: true, scheduleName: true } },
          substituteStaff: { select: { id: true, scheduleName: true } },
          timetableSlot: { include: { course: { select: { name: true } } } },
        },
        orderBy: { period: "asc" },
      },
    },
  });
  if (!plan) return null;

  const entries = plan.entries;
  return {
    planId: plan.id,
    entries,
    /** COVER/SWAP lessons this staff member must teach that day */
    forSubstitute: (staffId: string) =>
      entries.filter(
        (e) => (e.kind === "COVER" || e.kind === "SWAP") && e.substituteStaffId === staffId
      ),
    /** This staff member's own lessons affected (absences covered/released/moved) */
    forAbsent: (staffId: string) => entries.filter((e) => e.absentStaffId === staffId),
    /** Entries touching a group (for student schedule / locate) */
    forGroup: (groupId: string) => entries.filter((e) => e.groupId === groupId),
    studyHalls: entries.filter((e) => e.kind === "STUDY_HALL"),
  };
}
