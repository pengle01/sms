import { describe, it, expect } from "vitest";
import { buildDetailLines, parseBehaviorColumn, type DetailAtt } from "@/lib/behaviorDetail";
import { partialDayAbsences, partialDayDates } from "@/lib/behaviorFlags";

const att = (o: Partial<DetailAtt> & { studentId: string }): DetailAtt => ({
  date: "2026-03-16", dayOfWeek: 1, period: 1, courseId: "c", courseName: "Μαθηματικά",
  status: "ABSENT", waived: false, isAutoAbsent: false, minutesDelayed: 0, activity: null, ...o,
});
const students = [
  { id: "b", name: "Βήτα", registryNo: "2" },
  { id: "a", name: "Άλφα", registryNo: "1" },
  { id: "c", name: "Γάμμα", registryNo: "3" },
];

describe("parseBehaviorColumn", () => {
  it("accepts a known column and falls back on anything else", () => {
    expect(parseBehaviorColumn("toilet")).toBe("toilet");
    expect(parseBehaviorColumn("nope")).toBe("absences");
    expect(parseBehaviorColumn(undefined)).toBe("absences");
  });
});

describe("buildDetailLines", () => {
  it("gives one line per student by name, leaves out those with nothing, and counts them", () => {
    const { lines, none } = buildDetailLines({
      column: "absences", students,
      attendance: [att({ studentId: "b" }), att({ studentId: "a" })],
    });
    expect(lines.map((l) => l.studentId)).toEqual(["a", "b"]);
    expect(none).toBe(1);
  });

  it("counts absences as the table does: no erased rows, auto-absent included", () => {
    const { lines } = buildDetailLines({
      column: "absences", students,
      attendance: [
        att({ studentId: "a", period: 1 }),
        att({ studentId: "a", period: 2, waived: true }),
        att({ studentId: "a", period: 3, status: "LATE", isAutoAbsent: true }),
        att({ studentId: "a", period: 4, status: "PRESENT" }),
      ],
    });
    expect(lines[0]!.entries.map((e) => e.period)).toEqual([1, 3]);
  });

  it("sorts each student's entries by date and period", () => {
    const { lines } = buildDetailLines({
      column: "absences", students,
      attendance: [
        att({ studentId: "a", date: "2026-03-17", period: 1 }),
        att({ studentId: "a", date: "2026-03-16", period: 5 }),
        att({ studentId: "a", date: "2026-03-16", period: 2 }),
      ],
    });
    expect(lines[0]!.entries.map((e) => [e.date, e.period])).toEqual([
      ["2026-03-16", 2], ["2026-03-16", 5], ["2026-03-17", 1],
    ]);
  });

  it("names the activity instead of the subject, and lists only those in its column", () => {
    const attendance = [att({ studentId: "a", period: 1, activity: "Εκδρομή" }), att({ studentId: "a", period: 2 })];
    const all = buildDetailLines({ column: "absences", students, attendance }).lines[0]!.entries;
    expect(all.map((e) => [e.label, e.onActivity])).toEqual([["Εκδρομή", true], ["Μαθηματικά", false]]);
    const activity = buildDetailLines({ column: "activityAbsences", students, attendance }).lines[0]!.entries;
    expect(activity.map((e) => e.period)).toEqual([1]);
  });

  it("lists lates with minutes, without erased ones", () => {
    const { lines } = buildDetailLines({
      column: "lates", students,
      attendance: [
        att({ studentId: "a", status: "LATE", minutesDelayed: 7 }),
        att({ studentId: "a", status: "LATE", waived: true }),
      ],
    });
    expect(lines[0]!.entries.map((e) => e.minutes)).toEqual([7]);
  });

  it("lists toilet breaks, marking one still in progress", () => {
    const { lines } = buildDetailLines({
      column: "toilet", students,
      toilet: [
        { studentId: "a", date: "2026-03-16", period: 2, minutes: 6, courseId: "c", courseName: "Μαθηματικά" },
        { studentId: "a", date: "2026-03-16", period: 3, minutes: null, courseId: null, courseName: null },
      ],
    });
    expect(lines[0]!.entries.map((e) => [e.minutes, e.inProgress])).toEqual([[6, false], [null, true]]);
  });

  it("passes referral and low-grade entries through per student", () => {
    const { lines, none } = buildDetailLines({
      column: "referrals", students,
      other: [{ studentId: "c", entry: { date: "2026-03-16", referralId: "r", referralNumber: 4, outcome: null } }],
    });
    expect(lines[0]!.entries[0]).toEqual({ date: "2026-03-16", referralId: "r", referralNumber: 4, outcome: null });
    expect(none).toBe(2);
  });
});

describe("partial days", () => {
  const day = [
    att({ studentId: "a", date: "2026-03-16", period: 2 }),
    att({ studentId: "a", date: "2026-03-16", period: 1, status: "PRESENT" }),
    att({ studentId: "a", date: "2026-03-17", period: 1 }),
    att({ studentId: "a", date: "2026-03-17", period: 2 }),
  ];

  it("finds days mixing an absence with attendance, with the absent periods", () => {
    expect(partialDayDates(day)).toEqual([{ date: "2026-03-16", absentPeriods: [2] }]);
  });

  it("agrees with the flag's count and the column's lines", () => {
    expect(partialDayAbsences(day)?.count).toBe(1);
    const { lines } = buildDetailLines({ column: "partialDays", students, attendance: day });
    expect(lines[0]!.entries).toEqual([{ date: "2026-03-16", periods: [2] }]);
  });
});
