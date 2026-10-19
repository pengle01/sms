import { db } from "@/server/db";
import { dutyNameKey, dayBreaks, reportGrid, type DayBreak, type GridRow } from "@/lib/breakDuty";
import { getBellSchedule } from "@/lib/schoolConfig";
import { utcMidnight } from "@/lib/dates";
import { staffDisplayName } from "@/lib/staffName";

/**
 * Timetable name key → StaffProfile id, for linking the duty programme's names
 * to teachers. A key two profiles share is left out (ambiguous → unlinked).
 */
export async function staffByDutyKey(): Promise<Map<string, string>> {
  const profiles = await db.staffProfile.findMany({
    where: { scheduleName: { not: null } },
    select: { id: true, scheduleName: true },
  });
  const map = new Map<string, string>();
  const dup = new Set<string>();
  for (const p of profiles) {
    const k = dutyNameKey(p.scheduleName!);
    if (map.has(k)) dup.add(k);
    else map.set(k, p.id);
  }
  for (const k of dup) map.delete(k);
  return map;
}

/** The weekly programme for one weekday: posts in file order with that day's teachers. */
export async function dutyPostsForDay(dow: number) {
  const posts = await db.dutyPost.findMany({
    orderBy: { order: "asc" },
    include: {
      assignments: {
        where: { dayOfWeek: dow },
        orderBy: { id: "asc" },
        select: { teacherName: true, staffProfileId: true },
      },
    },
  });
  return posts.map((p) => ({
    code: p.code,
    name: p.name,
    teachers: p.assignments.map((a) => a.teacherName),
    staffIds: Object.fromEntries(p.assignments.map((a) => [a.teacherName, a.staffProfileId])),
  }));
}


export interface BreakDutyDay {
  dateIso: string;
  dow: number | null;
  breaks: DayBreak[];
  posts: { code: string; name: string; teachers: string[] }[];
  rows: GridRow[];
  /** Teachers (by name as in the programme) absent that day in the final substitution plan. */
  absentTeachers: string[];
  dayComments: string | null;
  /** The deputies on that weekday's duty roster — the report's signatures. */
  deputies: string[];
}

/** Everything the duty tab, the print page and the office page show for one date. */
export async function loadBreakDutyDay(dateIso: string): Promise<BreakDutyDay> {
  const date = utcMidnight(dateIso);
  const jsDow = date.getUTCDay();
  const dow = jsDow >= 1 && jsDow <= 5 ? jsDow : null;
  if (!dow) {
    return { dateIso, dow: null, breaks: [], posts: [], rows: [], absentTeachers: [], dayComments: null, deputies: [] };
  }

  const [bell, posts, checks, report, plan, roster] = await Promise.all([
    getBellSchedule(),
    dutyPostsForDay(dow),
    db.dutyCheck.findMany({
      where: { date },
      include: { checkedBy: { select: { scheduleName: true, user: { select: { name: true } } } } },
    }),
    db.dutyDayReport.findUnique({ where: { date } }),
    db.substitutionPlan.findFirst({
      where: { date, status: "FINAL" },
      select: { entries: { select: { absentStaffId: true } } },
    }),
    db.dutyRosterEntry.findMany({
      where: { dayOfWeek: dow },
      select: { staffProfile: { select: { scheduleName: true, user: { select: { name: true } } } } },
    }),
  ]);

  const breaks = dayBreaks(bell, dow);
  const absentIds = new Set((plan?.entries ?? []).map((e) => e.absentStaffId).filter(Boolean));
  const absentTeachers = posts.flatMap((p) =>
    p.teachers.filter((t) => {
      const id = p.staffIds[t];
      return !!id && absentIds.has(id);
    }),
  );

  return {
    dateIso,
    dow,
    breaks,
    posts: posts.map(({ code, name, teachers }) => ({ code, name, teachers })),
    rows: reportGrid(
      posts,
      checks.map((c) => ({
        breakNo: c.breakNo,
        postCode: c.postCode,
        teacherName: c.teacherName,
        present: c.present,
        comment: c.comment,
        checkedBy: staffDisplayName(c.checkedBy),
      })),
      breaks,
    ),
    absentTeachers,
    dayComments: report?.comments ?? null,
    deputies: roster.map((r) => r.staffProfile.user?.name ?? r.staffProfile.scheduleName ?? "—"),
  };
}
