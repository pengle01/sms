import { describe, it, expect } from "vitest";
import {
  HISTORY_KEYS,
  toHistoryCounts,
  historyBlockers,
  confirmsDeletion,
  studentUserDisposition,
  type RawStudentHistory,
  type StudentHistoryCounts,
} from "@/lib/studentDelete";
import { canDeleteStudent } from "@/lib/rbac";

const NONE: StudentHistoryCounts = Object.fromEntries(HISTORY_KEYS.map((k) => [k, 0])) as StudentHistoryCounts;

function raw(over: Partial<RawStudentHistory["_count"]> = {}, specialEd = false): RawStudentHistory {
  return {
    _count: {
      attendance: 0, grades: 0, testGrades: 0, referrals: 0, referralStudents: 0, exitPermits: 0,
      activityParticipations: 0, smsLogs: 0, conversations: 0, ddkAwards: 0, toiletBreaks: 0,
      ...over,
    },
    specialEd: specialEd ? { id: "se1" } : null,
  };
}

describe("toHistoryCounts", () => {
  it("is all zeros for a student with nothing", () => {
    expect(toHistoryCounts(raw())).toEqual(NONE);
  });

  it("adds legacy single-student referrals to the multi-student ones", () => {
    expect(toHistoryCounts(raw({ referrals: 1, referralStudents: 2 })).referrals).toBe(3);
  });

  it("counts a special-ed record as one", () => {
    expect(toHistoryCounts(raw({}, true)).specialEd).toBe(1);
  });

  it("maps activity participations to activities", () => {
    expect(toHistoryCounts(raw({ activityParticipations: 4 })).activities).toBe(4);
  });
});

describe("historyBlockers", () => {
  it("is empty when there is no history, so delete is allowed", () => {
    expect(historyBlockers(NONE)).toEqual([]);
  });

  it("lists only non-zero kinds, in display order", () => {
    const counts = { ...NONE, smsLogs: 2, attendance: 40, toiletBreaks: 1 };
    expect(historyBlockers(counts)).toEqual([
      { key: "attendance", count: 40 },
      { key: "smsLogs", count: 2 },
      { key: "toiletBreaks", count: 1 },
    ]);
  });

  // The cascading kinds would be wiped silently by the database, so they must
  // block just like the RESTRICT ones.
  it("blocks on history the database would otherwise cascade away", () => {
    for (const key of ["specialEd", "conversations", "ddkAwards", "toiletBreaks"] as const) {
      expect(historyBlockers({ ...NONE, [key]: 1 })).toEqual([{ key, count: 1 }]);
    }
  });
});

describe("confirmsDeletion", () => {
  it("accepts the exact registry number", () => {
    expect(confirmsDeletion("90012", "90012")).toBe(true);
  });

  it("tolerates surrounding whitespace", () => {
    expect(confirmsDeletion("  90012 ", "90012")).toBe(true);
  });

  it("rejects a different or partial number", () => {
    expect(confirmsDeletion("9001", "90012")).toBe(false);
    expect(confirmsDeletion("90013", "90012")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(confirmsDeletion("", "90012")).toBe(false);
    expect(confirmsDeletion(null, "90012")).toBe(false);
    expect(confirmsDeletion(undefined, "90012")).toBe(false);
  });

  it("can never be confirmed when the student has no registry number", () => {
    expect(confirmsDeletion("", "")).toBe(false);
    expect(confirmsDeletion(" ", "  ")).toBe(false);
  });
});

describe("studentUserDisposition", () => {
  it("deletes a student account with no audit trail", () => {
    expect(studentUserDisposition("STUDENT", 0)).toBe("delete");
  });

  it("locks out, rather than deletes, an account with audit rows", () => {
    expect(studentUserDisposition("STUDENT", 1)).toBe("deactivate");
  });

  it("never deletes an account of another role", () => {
    expect(studentUserDisposition("PARENT", 0)).toBe("keep");
    expect(studentUserDisposition("TEACHER", 0)).toBe("keep");
    expect(studentUserDisposition("SUPER_ADMIN", 3)).toBe("keep");
  });
});

describe("canDeleteStudent", () => {
  it("allows the secretariat and the system admin", () => {
    expect(canDeleteStudent(["SCHOOL_ADMIN"])).toBe(true);
    expect(canDeleteStudent(["SUPER_ADMIN"])).toBe(true);
  });

  it("allows a teacher holding an admin-granted SUPER_ADMIN role", () => {
    expect(canDeleteStudent(["TEACHER", "SUPER_ADMIN"])).toBe(true);
  });

  it("refuses educators, management and families", () => {
    for (const role of ["TEACHER", "HEADMASTER", "HEADTEACHER_A", "HEADTEACHER_B", "STUDENT_COUNSELOR", "PARENT", "STUDENT"] as const) {
      expect(canDeleteStudent([role])).toBe(false);
    }
  });

  it("refuses no roles at all", () => {
    expect(canDeleteStudent([])).toBe(false);
  });
});
