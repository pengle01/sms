import { describe, it, expect } from "vitest";
import {
  summarizeByStudent,
  summarizeByGroup,
  periodDistribution,
  toCsv,
  type ReportRow,
  rollCall,
} from "@/lib/attendanceReport";

const row = (over: Partial<ReportRow>): ReportRow => ({
  studentProfileId: "s1",
  studentName: "ΓΕΩΡΓΙΟΥ Γ.",
  studentId: "1001",
  groupId: "g1",
  groupName: "ΘΒΣ1",
  date: "2026-03-09",
  period: 1,
  status: "ABSENT",
  isAutoAbsent: false,
  hasExitPermit: false,
  ...over,
});

describe("Attendance report", () => {
  it("aggregates absences, lates and permits per student", () => {
    const rows = [
      row({}),
      row({ period: 2, isAutoAbsent: true }),
      row({ period: 3, status: "LATE" }),
      row({ date: "2026-03-10" }),
      row({ date: "2026-03-10", period: 2, hasExitPermit: true }),
    ];
    const [s] = summarizeByStudent(rows);
    expect(s).toMatchObject({ absences: 4, autoAbsent: 1, late: 1, withPermit: 1 });
    expect(s!.days).toBe(2); // two distinct dates with an absence
  });

  it("counts nothing for a status the app cannot produce", () => {
    // EXCUSED is still in the Prisma enum but no write path can set it, and the
    // reports no longer claim a figure for it.
    const rows = [row({ status: "EXCUSED" }), row({ period: 2, status: "PRESENT" })];
    const [s] = summarizeByStudent(rows);
    expect(s).toMatchObject({ absences: 0, late: 0 });
    expect(s!.days).toBe(0);
  });

  it("sorts students by most absences", () => {
    const rows = [
      row({ studentProfileId: "a", studentName: "Α" }),
      row({ studentProfileId: "b", studentName: "Β" }),
      row({ studentProfileId: "b", studentName: "Β", period: 2 }),
    ];
    expect(summarizeByStudent(rows).map((s) => s.studentProfileId)).toEqual(["b", "a"]);
  });

  it("counts distinct students per group", () => {
    const rows = [
      row({ studentProfileId: "a" }),
      row({ studentProfileId: "a", period: 2 }),
      row({ studentProfileId: "b" }),
      row({ studentProfileId: "c", groupId: "g2", groupName: "ΒΞ1" }),
    ];
    const groups = summarizeByGroup(rows);
    expect(groups[0]).toMatchObject({ groupName: "ΘΒΣ1", students: 2, absences: 3 });
    expect(groups[1]).toMatchObject({ groupName: "ΒΞ1", students: 1 });
  });

  it("builds the per-period distribution counting only absences", () => {
    const rows = [row({ period: 1 }), row({ period: 1 }), row({ period: 7 }), row({ period: 2, status: "LATE" })];
    const dist = periodDistribution(rows, 7);
    expect(dist).toHaveLength(7);
    expect(dist[0]).toEqual({ period: 1, count: 2 });
    expect(dist[1]).toEqual({ period: 2, count: 0 }); // LATE doesn't count
    expect(dist[6]).toEqual({ period: 7, count: 1 });
  });

  it("keeps waived rows on record but out of every total", () => {
    const rows = [
      row({}),
      row({ period: 2, waived: true }),
      row({ period: 3, waived: true }),
    ];
    const [s] = summarizeByStudent(rows);
    expect(s).toMatchObject({ absences: 1, waived: 2 });
    const [g] = summarizeByGroup(rows);
    expect(g!.absences).toBe(1);
    expect(periodDistribution(rows, 3).map((d) => d.count)).toEqual([1, 0, 0]);
  });

  it("handles empty input", () => {
    expect(summarizeByStudent([])).toEqual([]);
    expect(summarizeByGroup([])).toEqual([]);
    expect(periodDistribution([], 7).every((p) => p.count === 0)).toBe(true);
  });

  it("escapes CSV values and prepends a BOM", () => {
    const csv = toCsv(["a", "b"], [['x,"y"', 5]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain('"x,""y""",5');
  });
});

describe("rollCall", () => {
  const sched = new Map([["g1", 7]]);
  const r = (over: Partial<ReportRow & { smsSent: boolean }> = {}) => ({
    studentProfileId: "s1",
    studentName: "Νικολάου Νίκος",
    studentId: "1001",
    groupId: "g1",
    groupName: "ΗΥ3",
    date: "2025-09-08",
    period: 3,
    status: "ABSENT",
    isAutoAbsent: false,
    hasExitPermit: false,
    ...over,
  });

  it("collapses a student's periods into one row", () => {
    // The case that prompted this: five stored rows, two actual students.
    const out = rollCall(
      [
        r({ period: 3 }),
        r({ period: 4 }),
        r({ period: 5 }),
        r({ studentProfileId: "s2", studentName: "Βασιλείου Άντρη", studentId: "1002", period: 3 }),
      ],
      sched,
    );
    expect(out).toHaveLength(2);
    expect(out.find((x) => x.studentProfileId === "s1")!.periods).toEqual([3, 4, 5]);
    expect(out.find((x) => x.studentProfileId === "s2")!.periods).toEqual([3]);
  });

  it("sorts the periods even when the rows arrive out of order", () => {
    expect(rollCall([r({ period: 6 }), r({ period: 2 })], sched)[0]!.periods).toEqual([2, 6]);
  });

  it("keeps erased periods out of the count but reports them", () => {
    const out = rollCall([r({ period: 3 }), r({ period: 4, waived: true })], sched)[0]!;
    expect(out.periods).toEqual([3]);
    expect(out.waived).toBe(1);
  });

  it("marks a whole day only when every scheduled lesson was missed", () => {
    const four = [3, 4, 5, 6].map((p) => r({ period: p }));
    expect(rollCall(four, new Map([["g1", 7]]))[0]!.wholeDay).toBe(false);
    expect(rollCall(four, new Map([["g1", 4]]))[0]!.wholeDay).toBe(true);
  });

  it("does not claim a whole day when the timetable is unknown", () => {
    const out = rollCall([r({ period: 3 })], new Map())[0]!;
    expect(out.scheduled).toBe(0);
    expect(out.wholeDay).toBe(false);
  });

  it("counts lateness separately from absent periods", () => {
    const out = rollCall([r({ period: 1, status: "LATE" }), r({ period: 3 })], sched)[0]!;
    expect(out.late).toBe(1);
    expect(out.periods).toEqual([3]);
  });

  it("carries a permit or a sent SMS from any of the student's rows", () => {
    const out = rollCall([r({ period: 3 }), r({ period: 4, hasExitPermit: true, smsSent: true })], sched)[0]!;
    expect(out.hasPermit).toBe(true);
    expect(out.smsSent).toBe(true);
  });

  it("orders by group then name, so it reads like a register", () => {
    const out = rollCall(
      [
        r({ studentProfileId: "b", studentName: "Βήτα", groupId: "g2", groupName: "ΘΒΣ2" }),
        r({ studentProfileId: "c", studentName: "Άλφα", groupId: "g2", groupName: "ΘΒΣ2" }),
        r({ studentProfileId: "a", studentName: "Ωμέγα", groupId: "g1", groupName: "ΕΓ1" }),
      ],
      sched,
    );
    expect(out.map((x) => x.studentName)).toEqual(["Ωμέγα", "Άλφα", "Βήτα"]);
  });

  it("returns nothing for an empty day", () => {
    expect(rollCall([], sched)).toEqual([]);
  });
});
