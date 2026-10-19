import { describe, it, expect } from "vitest";
import { missedLessons } from "@/lib/expulsionLessons";

const slots = [
  { dayOfWeek: 1, courseName: "Μαθηματικά", teacherName: "ΠΑΠΑΣ" },
  { dayOfWeek: 1, courseName: "Αγγλικά", teacherName: "ΓΕΩΡΓΙΟΥ" },
  { dayOfWeek: 2, courseName: "Μαθηματικά", teacherName: "ΠΑΠΑΣ" },
  { dayOfWeek: 2, courseName: "Φυσική", teacherName: "ΙΩΑΝΝΟΥ" },
  { dayOfWeek: 3, courseName: "Ιστορία", teacherName: "ΚΩΣΤΑ" },
];

describe("missedLessons", () => {
  it("lists the lessons on the expulsion weekdays, each subject/teacher once", () => {
    // 2026-10-19 is a Monday, 2026-10-20 a Tuesday
    expect(missedLessons(slots, ["2026-10-19", "2026-10-20"])).toEqual([
      { courseName: "Αγγλικά", teacherName: "ΓΕΩΡΓΙΟΥ" },
      { courseName: "Μαθηματικά", teacherName: "ΠΑΠΑΣ" },
      { courseName: "Φυσική", teacherName: "ΙΩΑΝΝΟΥ" },
    ]);
  });

  it("accepts Date values", () => {
    expect(missedLessons(slots, [new Date("2026-10-21T00:00:00.000Z")])).toEqual([
      { courseName: "Ιστορία", teacherName: "ΚΩΣΤΑ" },
    ]);
  });

  it("skips days with no school", () => {
    expect(missedLessons(slots, ["2026-10-19", "2026-10-20"], new Set(["2026-10-20"]))).toEqual([
      { courseName: "Αγγλικά", teacherName: "ΓΕΩΡΓΙΟΥ" },
      { courseName: "Μαθηματικά", teacherName: "ΠΑΠΑΣ" },
    ]);
  });

  it("keeps the same subject with two different teachers", () => {
    const s = [...slots, { dayOfWeek: 1, courseName: "Μαθηματικά", teacherName: "ΑΝΔΡΕΟΥ" }];
    expect(missedLessons(s, ["2026-10-19"]).map((l) => l.teacherName)).toEqual(["ΓΕΩΡΓΙΟΥ", "ΑΝΔΡΕΟΥ", "ΠΑΠΑΣ"]);
  });

  it("returns nothing for weekends or no days", () => {
    expect(missedLessons(slots, ["2026-10-18"])).toEqual([]);
    expect(missedLessons(slots, [])).toEqual([]);
  });
});
