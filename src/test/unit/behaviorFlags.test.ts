import { describe, it, expect } from "vitest";
import {
  partialDayAbsences,
  repeatedCourseSkips,
  weekdayCluster,
  latenessPattern,
  toiletPatterns,
  analyzeStudent,
  riskScore,
  type AttRecord,
  type ToiletRecord,
} from "@/lib/behaviorFlags";

// Helper to build an attendance record with sensible defaults.
function att(p: Partial<AttRecord> & { date: string; status: AttRecord["status"] }): AttRecord {
  return {
    dayOfWeek: 1,
    period: 1,
    courseId: null,
    courseName: null,
    waived: false,
    ...p,
  };
}

describe("partialDayAbsences", () => {
  it("flags a day that mixes an absence with a present period (the skip signal)", () => {
    const rows = [
      att({ date: "2026-03-02", period: 1, status: "PRESENT" }),
      att({ date: "2026-03-02", period: 2, status: "PRESENT" }),
      att({ date: "2026-03-02", period: 4, status: "ABSENT" }), // skipped just P4
      att({ date: "2026-03-02", period: 5, status: "PRESENT" }),
    ];
    const flag = partialDayAbsences(rows);
    expect(flag?.code).toBe("PARTIAL_DAY_ABSENCE");
    expect(flag?.count).toBe(1);
    expect(flag?.severity).toBe("low"); // raised early, low for a single incident
  });

  it("does not flag a whole-day absence (no present period that day)", () => {
    const rows = [
      att({ date: "2026-03-02", period: 1, status: "ABSENT" }),
      att({ date: "2026-03-02", period: 2, status: "ABSENT" }),
    ];
    expect(partialDayAbsences(rows)).toBeNull();
  });

  it("escalates severity with repeated partial days", () => {
    const rows: AttRecord[] = [];
    for (const date of ["2026-03-02", "2026-03-03", "2026-03-04"]) {
      rows.push(att({ date, period: 1, status: "PRESENT" }));
      rows.push(att({ date, period: 3, status: "ABSENT" }));
    }
    const flag = partialDayAbsences(rows);
    expect(flag?.count).toBe(3);
    expect(flag?.severity).toBe("high");
  });

  it("ignores waived absences", () => {
    const rows = [
      att({ date: "2026-03-02", period: 1, status: "PRESENT" }),
      att({ date: "2026-03-02", period: 4, status: "ABSENT", waived: true }),
    ];
    expect(partialDayAbsences(rows)).toBeNull();
  });

  it("treats a late period as 'at school' for the mixed-day test", () => {
    const rows = [
      att({ date: "2026-03-02", period: 1, status: "LATE" }),
      att({ date: "2026-03-02", period: 4, status: "ABSENT" }),
    ];
    expect(partialDayAbsences(rows)?.count).toBe(1);
  });
});

describe("repeatedCourseSkips", () => {
  it("flags a course missed at least the threshold number of times", () => {
    const rows = Array.from({ length: 3 }, (_, i) =>
      att({ date: `2026-03-0${i + 1}`, courseId: "math", courseName: "Μαθηματικά", status: "ABSENT" })
    );
    const flags = repeatedCourseSkips(rows);
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ code: "REPEATED_COURSE_SKIP", count: 3, course: "Μαθηματικά", severity: "medium" });
  });

  it("does not flag below the threshold", () => {
    const rows = [
      att({ date: "2026-03-01", courseId: "math", status: "ABSENT" }),
      att({ date: "2026-03-02", courseId: "math", status: "ABSENT" }),
    ];
    expect(repeatedCourseSkips(rows)).toHaveLength(0);
  });

  it("raises severity to high at five or more", () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      att({ date: `2026-03-0${i + 1}`, courseId: "phys", courseName: "Φυσική", status: "ABSENT" })
    );
    expect(repeatedCourseSkips(rows)[0]?.severity).toBe("high");
  });
});

describe("weekdayCluster", () => {
  it("flags absences concentrated on one weekday", () => {
    const rows = [
      att({ date: "2026-03-06", dayOfWeek: 5, status: "ABSENT" }), // Fri
      att({ date: "2026-03-13", dayOfWeek: 5, status: "ABSENT" }), // Fri
      att({ date: "2026-03-20", dayOfWeek: 5, status: "ABSENT" }), // Fri
    ];
    const flag = weekdayCluster(rows);
    expect(flag?.code).toBe("WEEKDAY_CLUSTER");
    expect(flag?.weekday).toBe(5);
    expect(flag?.count).toBe(3);
  });

  it("does not flag when absences are spread across weekdays", () => {
    const rows = [
      att({ date: "2026-03-02", dayOfWeek: 1, status: "ABSENT" }),
      att({ date: "2026-03-04", dayOfWeek: 3, status: "ABSENT" }),
      att({ date: "2026-03-06", dayOfWeek: 5, status: "ABSENT" }),
    ];
    expect(weekdayCluster(rows)).toBeNull();
  });

  it("counts a day once even with multiple absent periods", () => {
    const rows = [
      att({ date: "2026-03-06", dayOfWeek: 5, period: 1, status: "ABSENT" }),
      att({ date: "2026-03-06", dayOfWeek: 5, period: 2, status: "ABSENT" }),
      att({ date: "2026-03-13", dayOfWeek: 5, status: "ABSENT" }),
      att({ date: "2026-03-20", dayOfWeek: 5, status: "ABSENT" }),
    ];
    expect(weekdayCluster(rows)?.count).toBe(3);
  });
});

describe("latenessPattern", () => {
  it("flags repeated lateness", () => {
    const rows = Array.from({ length: 4 }, (_, i) =>
      att({ date: `2026-03-0${i + 1}`, period: 1, status: "LATE" })
    );
    const flag = latenessPattern(rows);
    expect(flag?.code).toBe("LATENESS");
    expect(flag?.count).toBe(4);
    expect(flag?.severity).toBe("high"); // first-period lates dominate
  });

  it("medium severity when lates are not first period", () => {
    const rows = Array.from({ length: 4 }, (_, i) =>
      att({ date: `2026-03-0${i + 1}`, period: 4, status: "LATE" })
    );
    expect(latenessPattern(rows)?.severity).toBe("medium");
  });

  it("does not flag below the threshold", () => {
    const rows = [att({ date: "2026-03-01", status: "LATE" })];
    expect(latenessPattern(rows)).toBeNull();
  });
});

describe("toiletPatterns", () => {
  const brk = (p: Partial<ToiletRecord> & { date: string }): ToiletRecord => ({
    period: 1,
    minutes: 5,
    courseId: null,
    courseName: null,
    ...p,
  });

  it("flags many breaks in a single day", () => {
    const breaks = [
      brk({ date: "2026-03-02", period: 1 }),
      brk({ date: "2026-03-02", period: 2 }),
      brk({ date: "2026-03-02", period: 3 }),
    ];
    const flags = toiletPatterns(breaks);
    expect(flags.find((f) => f.code === "TOILET_FREQUENT")?.count).toBe(3);
  });

  it("flags a long break as high severity", () => {
    const flags = toiletPatterns([brk({ date: "2026-03-02", minutes: 15 })]);
    const long = flags.find((f) => f.code === "TOILET_LONG");
    expect(long?.severity).toBe("high");
    expect(long?.count).toBe(1);
  });

  it("flags the same lesson left repeatedly", () => {
    const breaks = Array.from({ length: 3 }, (_, i) =>
      brk({ date: `2026-03-0${i + 1}`, courseId: "eng", courseName: "Αγγλικά" })
    );
    const same = toiletPatterns(breaks).find((f) => f.code === "TOILET_SAME_LESSON");
    expect(same).toMatchObject({ count: 3, course: "Αγγλικά" });
  });

  it("ignores open breaks (null minutes) for the long-break test", () => {
    expect(toiletPatterns([brk({ date: "2026-03-02", minutes: null })]).find((f) => f.code === "TOILET_LONG")).toBeUndefined();
  });
});

describe("analyzeStudent / riskScore", () => {
  it("returns no flags for clean records", () => {
    const flags = analyzeStudent({
      attendance: [att({ date: "2026-03-02", status: "PRESENT" })],
      toilet: [],
    });
    expect(flags).toHaveLength(0);
    expect(riskScore(flags)).toBe(0);
  });

  it("aggregates and severity-sorts flags, and scores risk", () => {
    const attendance: AttRecord[] = [
      // partial-day skip (low)
      att({ date: "2026-03-02", period: 1, status: "PRESENT" }),
      att({ date: "2026-03-02", period: 4, status: "ABSENT", courseId: "math", courseName: "Μαθηματικά" }),
      // build a high-severity course skip (5 math absences)
      att({ date: "2026-03-03", courseId: "math", courseName: "Μαθηματικά", status: "ABSENT" }),
      att({ date: "2026-03-04", courseId: "math", courseName: "Μαθηματικά", status: "ABSENT" }),
      att({ date: "2026-03-05", courseId: "math", courseName: "Μαθηματικά", status: "ABSENT" }),
      att({ date: "2026-03-06", courseId: "math", courseName: "Μαθηματικά", status: "ABSENT" }),
    ];
    const flags = analyzeStudent({ attendance, toilet: [] });
    expect(flags.length).toBeGreaterThanOrEqual(2);
    // highest severity first
    expect(flags[0]?.severity).toBe("high");
    expect(riskScore(flags)).toBeGreaterThanOrEqual(4);
  });
});
