// Pure timetable/group integrity checks — no DB imports, unit-testable.
// The caller (admin checks page / dashboard) assembles plain arrays from
// Prisma and passes them in; active-student filtering happens in the query.

import { periodsForDow, type PeriodsPerDay } from "@/lib/periods";

export interface CheckStudent {
  id: string;
  name: string | null;
  groupId: string | null; // homegroup, may be null
  subjectGroupIds: string[]; // from the StudentGroup join
}

export interface CheckSlot {
  groupId: string;
  dayOfWeek: number; // 1=Mon … 5=Fri
  period: number; // 1-based
}

export interface CheckGroup {
  id: string;
  name: string;
  homeroomCount: number; // _count.students
  enrolledCount: number; // _count.studentGroups
  slotCount: number; // _count.timetableSlots
}

export interface CoverageCell {
  dayOfWeek: number;
  period: number;
}

export interface OverlapCell extends CoverageCell {
  count: number;
  groupIds: string[]; // which of the student's groups collide in this cell
}

export interface GroupRef {
  id: string;
  name: string;
}

export interface CoverageIssue {
  studentId: string;
  studentName: string | null;
  homegroup: GroupRef | null; // the student's homegroup (null = unassigned)
  subjectGroups: GroupRef[]; // the student's subject-group memberships
  gaps: CoverageCell[]; // cells with no slot in any of the student's groups
  overlaps: OverlapCell[]; // cells covered by ≥2 slots
  noHomegroup: boolean;
}

export interface EmptyGroupIssue {
  groupId: string;
  groupName: string;
  hasTimetable: boolean; // leftover timetable slots on an empty group
}

export interface IntegrityReport {
  emptyGroups: EmptyGroupIssue[];
  coverage: CoverageIssue[]; // only students with at least one problem
  // Students whose subject-group memberships redundantly include their own
  // homegroup (import artifact). Harmless for coverage (deduped) but worth
  // cleaning up; counts as a single issue.
  redundantMemberships: number;
  totalIssues: number;
}

export type SlotIndex = Map<string, Map<number, number>>; // groupId → cellKey → slot count

const cellKey = (dayOfWeek: number, period: number) => dayOfWeek * 100 + period;

export function buildSlotIndex(slots: CheckSlot[]): SlotIndex {
  const index: SlotIndex = new Map();
  for (const s of slots) {
    let cells = index.get(s.groupId);
    if (!cells) {
      cells = new Map();
      index.set(s.groupId, cells);
    }
    const key = cellKey(s.dayOfWeek, s.period);
    cells.set(key, (cells.get(key) ?? 0) + 1);
  }
  return index;
}

// For one student: every expected (day, period) cell must be covered by
// exactly one slot across all of the student's groups. Overlaps carry the
// ids of the groups that collide so the UI can explain the conflict.
export function studentCoverage(
  studentGroupIds: string[],
  slotIndex: SlotIndex,
  periodsPerDay: PeriodsPerDay
): { gaps: CoverageCell[]; overlaps: OverlapCell[] } {
  const gaps: CoverageCell[] = [];
  const overlaps: OverlapCell[] = [];

  // Dedupe — a student listed in the same group twice (e.g. their homegroup
  // also appearing as a subject membership) must not conflict with itself.
  const groupCells = [...new Set(studentGroupIds)]
    .map((id) => ({ id, cells: slotIndex.get(id) }))
    .filter((g): g is { id: string; cells: Map<number, number> } => !!g.cells);

  for (let dayOfWeek = 1; dayOfWeek <= 5; dayOfWeek++) {
    for (const period of periodsForDow(periodsPerDay, dayOfWeek)) {
      const key = cellKey(dayOfWeek, period);
      let count = 0;
      const involved: string[] = [];
      for (const g of groupCells) {
        const n = g.cells.get(key) ?? 0;
        if (n > 0) {
          count += n;
          involved.push(g.id);
        }
      }
      if (count === 0) gaps.push({ dayOfWeek, period });
      else if (count >= 2) overlaps.push({ dayOfWeek, period, count, groupIds: involved });
    }
  }

  return { gaps, overlaps };
}

// A group with no homeroom students AND no enrolled (subject) students.
export function findEmptyGroups(groups: CheckGroup[]): EmptyGroupIssue[] {
  return groups
    .filter((g) => g.homeroomCount === 0 && g.enrolledCount === 0)
    .map((g) => ({ groupId: g.id, groupName: g.name, hasTimetable: g.slotCount > 0 }));
}

export function computeIntegrityReport(args: {
  students: CheckStudent[];
  slots: CheckSlot[];
  groups: CheckGroup[];
  periodsPerDay: PeriodsPerDay;
}): IntegrityReport {
  const slotIndex = buildSlotIndex(args.slots);
  const nameById = new Map(args.groups.map((g) => [g.id, g.name]));
  const ref = (id: string): GroupRef => ({ id, name: nameById.get(id) ?? id });

  const coverage: CoverageIssue[] = [];
  let redundantMemberships = 0;
  for (const s of args.students) {
    if (s.groupId && s.subjectGroupIds.includes(s.groupId)) redundantMemberships++;
    const groupIds = [...(s.groupId ? [s.groupId] : []), ...s.subjectGroupIds];
    const { gaps, overlaps } = studentCoverage(groupIds, slotIndex, args.periodsPerDay);
    const noHomegroup = s.groupId === null;
    if (gaps.length > 0 || overlaps.length > 0 || noHomegroup) {
      coverage.push({
        studentId: s.id,
        studentName: s.name,
        homegroup: s.groupId ? ref(s.groupId) : null,
        subjectGroups: s.subjectGroupIds.map(ref),
        gaps,
        overlaps,
        noHomegroup,
      });
    }
  }

  const emptyGroups = findEmptyGroups(args.groups);

  return {
    emptyGroups,
    coverage,
    redundantMemberships,
    // Redundant memberships count as one collective issue, not one per student.
    totalIssues: emptyGroups.length + coverage.length + (redundantMemberships > 0 ? 1 : 0),
  };
}
