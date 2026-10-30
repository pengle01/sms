import { describe, it, expect } from "vitest";
import { missedLessonsByDay } from "@/lib/expulsionLessons";

const slots = [
  { dayOfWeek: 1, period: 2, courseName: "Μαθηματικά", teacherName: "ΠΑΠΑΣ" },
  { dayOfWeek: 1, period: 1, courseName: "Αγγλικά", teacherName: "ΓΕΩΡΓΙΟΥ" },
  { dayOfWeek: 2, period: 1, courseName: "Μαθηματικά", teacherName: "ΠΑΠΑΣ" },
  { dayOfWeek: 2, period: 4, courseName: "Φυσική", teacherName: "ΙΩΑΝΝΟΥ" },
  { dayOfWeek: 2, period: 6, courseName: "Ιστορία", teacherName: "ΚΩΣΤΑ" },
  { dayOfWeek: 3, period: 3, courseName: "Ιστορία", teacherName: "ΚΩΣΤΑ" },
];

describe("missedLessonsByDay", () => {
  it("lists each date's lessons in period order, dates in order", () => {
    // 2026-10-19 is a Monday, 2026-10-21 a Wednesday
    expect(missedLessonsByDay(slots, ["2026-10-21", "2026-10-19"])).toEqual([
      {
        iso: "2026-10-19",
        noSchool: false,
        lessons: [
          { period: 1, courseName: "Αγγλικά", teacherName: "ΓΕΩΡΓΙΟΥ" },
          { period: 2, courseName: "Μαθηματικά", teacherName: "ΠΑΠΑΣ" },
        ],
      },
      { iso: "2026-10-21", noSchool: false, lessons: [{ period: 3, courseName: "Ιστορία", teacherName: "ΚΩΣΤΑ" }] },
    ]);
  });

  it("accepts Date values", () => {
    expect(missedLessonsByDay(slots, [new Date("2026-10-21T00:00:00.000Z")])[0]!.lessons).toHaveLength(1);
  });

  it("keeps only the expelled periods of a partial day", () => {
    const [day] = missedLessonsByDay(slots, [{ date: "2026-10-20", fromPeriod: 3, toPeriod: 5 }]);
    expect(day!.lessons.map((l) => l.courseName)).toEqual(["Φυσική"]);
    expect(missedLessonsByDay(slots, ["2026-10-20"])[0]!.lessons).toHaveLength(3);
  });

  it("flags a day with no school and lists nothing for it", () => {
    expect(missedLessonsByDay(slots, ["2026-10-20"], new Set(["2026-10-20"]))).toEqual([
      { iso: "2026-10-20", noSchool: true, lessons: [] },
    ]);
  });

  it("shows the subject group's lesson instead of the homegroup's in the same period", () => {
    const s = [...slots, { dayOfWeek: 1, period: 2, courseName: "Πληροφορική", teacherName: "ΑΝΔΡΕΟΥ", subjectGroup: true }];
    expect(missedLessonsByDay(s, ["2026-10-19"])[0]!.lessons.map((l) => l.courseName)).toEqual(["Αγγλικά", "Πληροφορική"]);
  });

  it("drops weekends and returns nothing for no days", () => {
    expect(missedLessonsByDay(slots, ["2026-10-18"])).toEqual([]);
    expect(missedLessonsByDay(slots, [])).toEqual([]);
  });
});
