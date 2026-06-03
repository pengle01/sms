import { describe, it, expect } from "vitest";
import {
  buildSlotIndex,
  studentCoverage,
  findEmptyGroups,
  computeIntegrityReport,
  type CheckSlot,
  type CheckGroup,
} from "@/lib/integrityChecks";
import { DEFAULT_PERIODS_PER_DAY } from "@/lib/periods";

// A full week of slots (7 periods × 5 days) for one group.
function fullWeek(groupId: string): CheckSlot[] {
  const slots: CheckSlot[] = [];
  for (let dow = 1; dow <= 5; dow++) {
    for (let p = 1; p <= 7; p++) slots.push({ groupId, dayOfWeek: dow, period: p });
  }
  return slots;
}

const group = (over: Partial<CheckGroup> & { id: string }): CheckGroup => ({
  name: over.id,
  homeroomCount: 0,
  enrolledCount: 0,
  slotCount: 0,
  ...over,
});

describe("studentCoverage", () => {
  it("reports no issues when every cell is covered exactly once", () => {
    const index = buildSlotIndex(fullWeek("A"));
    const { gaps, overlaps } = studentCoverage(["A"], index, DEFAULT_PERIODS_PER_DAY);
    expect(gaps).toEqual([]);
    expect(overlaps).toEqual([]);
  });

  it("reports a gap for a missing cell", () => {
    const slots = fullWeek("A").filter((s) => !(s.dayOfWeek === 3 && s.period === 4));
    const index = buildSlotIndex(slots);
    const { gaps, overlaps } = studentCoverage(["A"], index, DEFAULT_PERIODS_PER_DAY);
    expect(gaps).toEqual([{ dayOfWeek: 3, period: 4 }]);
    expect(overlaps).toEqual([]);
  });

  it("reports an overlap with the colliding groups when two groups share a cell", () => {
    const slots = [...fullWeek("A"), { groupId: "MATH", dayOfWeek: 2, period: 1 }];
    const index = buildSlotIndex(slots);
    const { gaps, overlaps } = studentCoverage(["A", "MATH"], index, DEFAULT_PERIODS_PER_DAY);
    expect(gaps).toEqual([]);
    expect(overlaps).toEqual([{ dayOfWeek: 2, period: 1, count: 2, groupIds: ["A", "MATH"] }]);
  });

  it("respects a custom periods-per-day config", () => {
    // Monday only has 6 periods — a 7th-period Monday slot is simply ignored,
    // and the 6-period day needs no 7th slot.
    const config = { ...DEFAULT_PERIODS_PER_DAY, 1: 6 };
    const slots = fullWeek("A").filter((s) => !(s.dayOfWeek === 1 && s.period === 7));
    const index = buildSlotIndex(slots);
    const { gaps, overlaps } = studentCoverage(["A"], index, config);
    expect(gaps).toEqual([]);
    expect(overlaps).toEqual([]);
  });

  it("reports every cell as a gap for a student with no groups", () => {
    const index = buildSlotIndex(fullWeek("A"));
    const { gaps } = studentCoverage([], index, DEFAULT_PERIODS_PER_DAY);
    expect(gaps).toHaveLength(35);
  });

  it("never conflicts a group with itself when listed twice", () => {
    // Import artifact: the homegroup also appears as a subject membership.
    const index = buildSlotIndex(fullWeek("A"));
    const { gaps, overlaps } = studentCoverage(["A", "A"], index, DEFAULT_PERIODS_PER_DAY);
    expect(gaps).toEqual([]);
    expect(overlaps).toEqual([]);
  });
});

describe("findEmptyGroups", () => {
  it("flags only groups with neither homeroom nor enrolled students", () => {
    const groups = [
      group({ id: "A", homeroomCount: 20 }),
      group({ id: "MATH", enrolledCount: 12 }),
      group({ id: "GHOST", slotCount: 3 }),
      group({ id: "EMPTY" }),
    ];
    const issues = findEmptyGroups(groups);
    expect(issues.map((i) => i.groupId)).toEqual(["GHOST", "EMPTY"]);
    expect(issues.find((i) => i.groupId === "GHOST")?.hasTimetable).toBe(true);
    expect(issues.find((i) => i.groupId === "EMPTY")?.hasTimetable).toBe(false);
  });

  it("does not flag a subject group with members but no timetable slots", () => {
    expect(findEmptyGroups([group({ id: "MATH", enrolledCount: 5, slotCount: 0 })])).toEqual([]);
  });
});

describe("computeIntegrityReport", () => {
  const baseStudent = { id: "s1", name: "Μαθητής Α", groupId: "A", subjectGroupIds: [] };

  it("is clean for a fully covered student in a populated group", () => {
    const report = computeIntegrityReport({
      students: [baseStudent],
      slots: fullWeek("A"),
      groups: [group({ id: "A", homeroomCount: 1 })],
      periodsPerDay: DEFAULT_PERIODS_PER_DAY,
    });
    expect(report.coverage).toEqual([]);
    expect(report.emptyGroups).toEqual([]);
    expect(report.totalIssues).toBe(0);
  });

  it("flags a student without a homegroup even if subject groups cover nothing", () => {
    const report = computeIntegrityReport({
      students: [{ ...baseStudent, groupId: null }],
      slots: fullWeek("A"),
      groups: [group({ id: "A", homeroomCount: 0 })],
      periodsPerDay: DEFAULT_PERIODS_PER_DAY,
    });
    expect(report.coverage).toHaveLength(1);
    expect(report.coverage[0]!.noHomegroup).toBe(true);
    expect(report.coverage[0]!.homegroup).toBe(null);
    expect(report.coverage[0]!.gaps).toHaveLength(35);
  });

  it("names the student's groups in the issue for the fix UI", () => {
    const slots = [...fullWeek("A"), { groupId: "MATH", dayOfWeek: 2, period: 1 }];
    const report = computeIntegrityReport({
      students: [{ ...baseStudent, subjectGroupIds: ["MATH"] }],
      slots,
      groups: [
        group({ id: "A", name: "Α2", homeroomCount: 1 }),
        group({ id: "MATH", name: "ΜΑΘ1", enrolledCount: 1 }),
      ],
      periodsPerDay: DEFAULT_PERIODS_PER_DAY,
    });
    expect(report.coverage[0]!.homegroup).toEqual({ id: "A", name: "Α2" });
    expect(report.coverage[0]!.subjectGroups).toEqual([{ id: "MATH", name: "ΜΑΘ1" }]);
    expect(report.coverage[0]!.overlaps[0]!.groupIds).toEqual(["A", "MATH"]);
  });

  it("counts empty groups and coverage issues into totalIssues", () => {
    const report = computeIntegrityReport({
      students: [
        baseStudent, // fine
        { id: "s2", name: "Μαθητής Β", groupId: "B", subjectGroupIds: [] }, // all gaps
      ],
      slots: fullWeek("A"),
      groups: [
        group({ id: "A", homeroomCount: 1 }),
        group({ id: "B", homeroomCount: 1 }),
        group({ id: "EMPTY" }),
      ],
      periodsPerDay: DEFAULT_PERIODS_PER_DAY,
    });
    expect(report.coverage.map((c) => c.studentId)).toEqual(["s2"]);
    expect(report.emptyGroups.map((g) => g.groupId)).toEqual(["EMPTY"]);
    expect(report.totalIssues).toBe(2);
  });

  it("counts redundant own-homegroup memberships as one collective issue", () => {
    const report = computeIntegrityReport({
      students: [
        { ...baseStudent, subjectGroupIds: ["A"] }, // redundant, otherwise fine
        { id: "s2", name: "Β", groupId: "A", subjectGroupIds: ["A"] }, // also redundant
      ],
      slots: fullWeek("A"),
      groups: [group({ id: "A", homeroomCount: 2, enrolledCount: 2 })],
      periodsPerDay: DEFAULT_PERIODS_PER_DAY,
    });
    expect(report.coverage).toEqual([]); // no false self-conflicts
    expect(report.redundantMemberships).toBe(2);
    expect(report.totalIssues).toBe(1); // one collective cleanup issue
  });

  it("merges homegroup and subject-group slots for coverage", () => {
    // Homegroup covers everything except Tue P1; the subject group fills it.
    const slots = [
      ...fullWeek("A").filter((s) => !(s.dayOfWeek === 2 && s.period === 1)),
      { groupId: "MATH", dayOfWeek: 2, period: 1 },
    ];
    const report = computeIntegrityReport({
      students: [{ ...baseStudent, subjectGroupIds: ["MATH"] }],
      slots,
      groups: [group({ id: "A", homeroomCount: 1 }), group({ id: "MATH", enrolledCount: 1 })],
      periodsPerDay: DEFAULT_PERIODS_PER_DAY,
    });
    expect(report.totalIssues).toBe(0);
  });
});
