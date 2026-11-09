// «Τμήμα μου»: the detail behind a column of the students table — one line per
// student with every entry that makes up its number. Pure, unit-tested; the same
// rules as the table, so a line's count always equals that student's number.

import { isAbsence, partialDayDates, type AttRecord, type ToiletRecord } from "@/lib/behaviorFlags";

export const BEHAVIOR_COLUMNS = [
  "absences",
  "activityAbsences",
  "partialDays",
  "lates",
  "referrals",
  "toilet",
  "lowGrades",
] as const;
export type BehaviorColumn = (typeof BEHAVIOR_COLUMNS)[number];

export function parseBehaviorColumn(v: string | undefined): BehaviorColumn {
  return BEHAVIOR_COLUMNS.includes(v as BehaviorColumn) ? (v as BehaviorColumn) : "absences";
}

export interface DetailEntry {
  date: string; // ISO yyyy-mm-dd
  period?: number | null;
  /** Partial days: that day's absent periods. */
  periods?: number[];
  /** The subject, activity or test's subject. */
  label?: string | null;
  onActivity?: boolean;
  minutes?: number | null;
  /** A toilet break not yet over. */
  inProgress?: boolean;
  referralId?: string;
  referralNumber?: number;
  /** A referral's outcome; null while pending. */
  outcome?: string | null;
  mark?: string;
}

export interface DetailLine {
  studentId: string;
  studentName: string;
  registryNo: string;
  entries: DetailEntry[];
}

export type DetailStudent = { id: string; name: string; registryNo: string };
export type DetailAtt = AttRecord & { studentId: string; minutesDelayed: number; activity: string | null };
export type DetailToilet = ToiletRecord & { studentId: string };

function byDateThenPeriod(a: DetailEntry, b: DetailEntry): number {
  return a.date.localeCompare(b.date) || (a.period ?? 0) - (b.period ?? 0);
}

function attendanceEntries(column: BehaviorColumn, rows: readonly DetailAtt[]): DetailEntry[] {
  switch (column) {
    case "absences":
      return rows
        .filter(isAbsence)
        .map((r) => ({
          date: r.date,
          period: r.period,
          label: r.activity ?? r.courseName,
          onActivity: !!r.activity,
        }));
    case "activityAbsences":
      return rows
        .filter((r) => isAbsence(r) && r.activity)
        .map((r) => ({ date: r.date, period: r.period, label: r.activity, onActivity: true }));
    case "partialDays":
      return partialDayDates(rows).map((d) => ({ date: d.date, periods: d.absentPeriods }));
    case "lates":
      return rows
        .filter((r) => !r.waived && r.status === "LATE")
        .map((r) => ({ date: r.date, period: r.period, label: r.courseName, minutes: r.minutesDelayed }));
    default:
      return [];
  }
}

/**
 * One line per student who has something in this column, by name; `none` counts
 * the rest. `other` holds a referral or low-grade column's prepared entries.
 */
export function buildDetailLines(input: {
  column: BehaviorColumn;
  students: readonly DetailStudent[];
  attendance?: readonly DetailAtt[];
  toilet?: readonly DetailToilet[];
  other?: readonly { studentId: string; entry: DetailEntry }[];
}): { lines: DetailLine[]; none: number } {
  const entriesFor = (id: string): DetailEntry[] => {
    if (input.column === "toilet") {
      return (input.toilet ?? [])
        .filter((b) => b.studentId === id)
        .map((b) => ({
          date: b.date,
          period: b.period,
          label: b.courseName,
          minutes: b.minutes,
          inProgress: b.minutes == null,
        }));
    }
    if (input.column === "referrals" || input.column === "lowGrades") {
      return (input.other ?? []).filter((o) => o.studentId === id).map((o) => o.entry);
    }
    return attendanceEntries(input.column, (input.attendance ?? []).filter((r) => r.studentId === id));
  };
  const lines = input.students
    .map((s) => ({
      studentId: s.id,
      studentName: s.name,
      registryNo: s.registryNo,
      entries: entriesFor(s.id).sort(byDateThenPeriod),
    }))
    .filter((l) => l.entries.length > 0)
    .sort((a, b) => a.studentName.localeCompare(b.studentName, "el"));
  return { lines, none: input.students.length - lines.length };
}
