// Attendance reporting (office) — pure aggregation + CSV helpers.

export type ReportRow = {
  studentProfileId: string;
  studentName: string;
  studentId: string; // registry number
  groupId: string | null;
  groupName: string | null;
  date: string; // ISO yyyy-mm-dd
  period: number | null;
  status: string; // PRESENT | ABSENT | LATE
  isAutoAbsent: boolean;
  hasExitPermit: boolean;
  /** Soft-erased (διαγραφή): stays on record, excluded from every total. */
  waived?: boolean;
};

export type StudentSummary = {
  studentProfileId: string;
  studentName: string;
  studentId: string;
  groupName: string | null;
  days: number; // distinct dates with at least one absence
  absences: number; // ABSENT periods (includes auto-absent, excludes waived)
  autoAbsent: number;
  late: number;
  withPermit: number; // rows linked to an exit permit
  waived: number; // soft-erased rows — kept on record, not in the totals
};

export type GroupSummary = {
  groupId: string | null;
  groupName: string | null;
  students: number; // distinct students with entries
  absences: number;
  late: number;
  withPermit: number;
};

export function summarizeByStudent(rows: ReportRow[]): StudentSummary[] {
  const map = new Map<string, StudentSummary & { dates: Set<string> }>();
  for (const r of rows) {
    let s = map.get(r.studentProfileId);
    if (!s) {
      s = {
        studentProfileId: r.studentProfileId,
        studentName: r.studentName,
        studentId: r.studentId,
        groupName: r.groupName,
        days: 0,
        absences: 0,
        autoAbsent: 0,
        late: 0,
        withPermit: 0,
        waived: 0,
        dates: new Set(),
      };
      map.set(r.studentProfileId, s);
    }
    if (r.waived) {
      s.waived += 1; // kept on record, never counted in the totals
    } else if (r.status === "ABSENT") {
      s.absences += 1;
      s.dates.add(r.date);
      if (r.isAutoAbsent) s.autoAbsent += 1;
    } else if (r.status === "LATE") {
      s.late += 1;
    }
    if (r.hasExitPermit && !r.waived) s.withPermit += 1;
  }
  return [...map.values()]
    .map(({ dates, ...s }) => ({ ...s, days: dates.size }))
    .sort((a, b) => b.absences - a.absences || a.studentName.localeCompare(b.studentName, "el"));
}

export function summarizeByGroup(rows: ReportRow[]): GroupSummary[] {
  const map = new Map<string, GroupSummary & { studentIds: Set<string> }>();
  for (const r of rows) {
    const key = r.groupId ?? "—";
    let g = map.get(key);
    if (!g) {
      g = {
        groupId: r.groupId,
        groupName: r.groupName,
        students: 0,
        absences: 0,
        late: 0,
        withPermit: 0,
        studentIds: new Set(),
      };
      map.set(key, g);
    }
    g.studentIds.add(r.studentProfileId);
    if (r.waived) {
      // soft-erased — visible on record, not in totals
    } else if (r.status === "ABSENT") g.absences += 1;
    else if (r.status === "LATE") g.late += 1;
    if (r.hasExitPermit && !r.waived) g.withPermit += 1;
  }
  return [...map.values()]
    .map(({ studentIds, ...g }) => ({ ...g, students: studentIds.size }))
    .sort((a, b) => b.absences - a.absences || (a.groupName ?? "").localeCompare(b.groupName ?? "", "el"));
}

/** Absence count per period (1..maxPeriod) — which periods lose the most. */
export function periodDistribution(rows: ReportRow[], maxPeriod = 8): { period: number; count: number }[] {
  const counts = new Map<number, number>();
  for (const r of rows) {
    if (r.period == null || r.status !== "ABSENT" || r.waived) continue;
    counts.set(r.period, (counts.get(r.period) ?? 0) + 1);
  }
  const top = Math.max(maxPeriod, ...counts.keys(), 0);
  return Array.from({ length: top }, (_, i) => ({ period: i + 1, count: counts.get(i + 1) ?? 0 }));
}

/** RFC-4180-ish CSV with a UTF-8 BOM so Excel opens Greek correctly. */
export function toCsv(headers: string[], lines: (string | number | null)[][]): string {
  const esc = (v: string | number | null) => {
    const s = v == null ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [headers, ...lines].map((l) => l.map(esc).join(",")).join("\n");
}

/** One absent student on one day — the office's daily roll-call. */
export type RollCallStudent = {
  studentProfileId: string;
  studentName: string;
  studentId: string;
  groupId: string | null;
  groupName: string | null;
  /** Periods missed, sorted; erased ones excluded. */
  periods: number[];
  /** Erased rows for this student that day — on record, out of the count. */
  waived: number;
  /** Lessons the student actually had that day. 0 when the timetable is unknown. */
  scheduled: number;
  /** Absent from every lesson they had. False when `scheduled` is unknown. */
  wholeDay: boolean;
  hasPermit: boolean;
  smsSent: boolean;
  late: number;
};

/**
 * Collapse a day's absence rows into one line per student.
 *
 * The office is asked "who was absent today", and the stored form answers a
 * different question: one row per student PER PERIOD, so a pupil out all day
 * appears seven times. This folds those back into the pupil.
 *
 * `wholeDay` is judged against the lessons that student actually had, not the
 * length of the school day — a timetable with a free period would otherwise
 * make a full absence look partial.
 */
export function rollCall(
  rows: (ReportRow & { smsSent?: boolean })[],
  scheduledByGroup: Map<string, number>,
): RollCallStudent[] {
  const map = new Map<string, RollCallStudent>();

  for (const r of rows) {
    let s = map.get(r.studentProfileId);
    if (!s) {
      s = {
        studentProfileId: r.studentProfileId,
        studentName: r.studentName,
        studentId: r.studentId,
        groupId: r.groupId,
        groupName: r.groupName,
        periods: [],
        waived: 0,
        scheduled: (r.groupId && scheduledByGroup.get(r.groupId)) || 0,
        wholeDay: false,
        hasPermit: false,
        smsSent: false,
        late: 0,
      };
      map.set(r.studentProfileId, s);
    }

    if (r.waived) {
      s.waived += 1;
      continue; // on record, but not part of the day's count
    }
    if (r.status === "LATE") s.late += 1;
    else if (r.period != null) s.periods.push(r.period);
    if (r.hasExitPermit) s.hasPermit = true;
    if (r.smsSent) s.smsSent = true;
  }

  return [...map.values()]
    .map((s) => ({
      ...s,
      periods: [...s.periods].sort((a, b) => a - b),
      wholeDay: s.scheduled > 0 && s.periods.length >= s.scheduled,
    }))
    .sort(
      (a, b) =>
        (a.groupName ?? "").localeCompare(b.groupName ?? "", "el") ||
        a.studentName.localeCompare(b.studentName, "el"),
    );
}
