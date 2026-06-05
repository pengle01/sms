import { describe, it, expect } from "vitest";
import {
  summarizeByStudent,
  summarizeByGroup,
  periodDistribution,
  toCsv,
  type ReportRow,
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
  it("aggregates absences, lates, excused and permits per student", () => {
    const rows = [
      row({}),
      row({ period: 2, isAutoAbsent: true }),
      row({ period: 3, status: "LATE" }),
      row({ date: "2026-03-10", status: "EXCUSED" }),
      row({ date: "2026-03-10", period: 2, hasExitPermit: true }),
    ];
    const [s] = summarizeByStudent(rows);
    expect(s).toMatchObject({ absences: 3, autoAbsent: 1, late: 1, excused: 1, withPermit: 1 });
    expect(s!.days).toBe(2); // two distinct dates with absence/excused
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
