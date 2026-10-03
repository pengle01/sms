import { describe, it, expect } from "vitest";
import { roleFromScheduleName, effectiveStaffRole, isManagementRole, roleChangeError, expectedSignupRole, isDutyCandidate } from "@/lib/staffRole";

describe("roleFromScheduleName", () => {
  it("reads the management markers and the counselor prefix", () => {
    expect(roleFromScheduleName("ΗΥ-ΜΑΣΙΑ Μ. ΒΔ")).toBe("HEADTEACHER_B");
    expect(roleFromScheduleName("Β-ΚΥΡΙΑΚΟΥ Π. ΒΔΑ")).toBe("HEADTEACHER_A");
    expect(roleFromScheduleName("Ξ-ΑΝΔΡΕΟΥ Ι. Δ")).toBe("HEADMASTER");
    expect(roleFromScheduleName("ΣΕΑ-ΜΙΧΑΗΛ Χ.")).toBe("STUDENT_COUNSELOR");
  });

  it("treats an unmarked name (and an initial Δ.) as a teacher", () => {
    expect(roleFromScheduleName("Ε-ΛΑΜΠΡΟΥ Δ.")).toBe("TEACHER");
    expect(roleFromScheduleName("Σ-ΒΑΝΕΖΟΣ Α.")).toBe("TEACHER");
    expect(roleFromScheduleName(null)).toBe("TEACHER");
  });
});

describe("effectiveStaffRole", () => {
  it("the account role wins over everything", () => {
    expect(effectiveStaffRole({ accountRole: "HEADTEACHER_B", plannedRole: "TEACHER", scheduleName: "Μ-ΑΛΦΑ Α." })).toBe("HEADTEACHER_B");
    expect(effectiveStaffRole({ accountRole: "TEACHER", plannedRole: null, scheduleName: "Μ-ΑΛΦΑ Α. ΒΔ" })).toBe("TEACHER");
  });

  it("without an account, the planned role wins over the name", () => {
    expect(effectiveStaffRole({ accountRole: null, plannedRole: "HEADTEACHER_B", scheduleName: "Μ-ΑΛΦΑ Α." })).toBe("HEADTEACHER_B");
  });

  it("falls back to the name marker", () => {
    expect(effectiveStaffRole({ accountRole: null, plannedRole: null, scheduleName: "Μ-ΑΛΦΑ Α. ΒΔ" })).toBe("HEADTEACHER_B");
    expect(effectiveStaffRole({ accountRole: null, plannedRole: null, scheduleName: "Μ-ΑΛΦΑ Α." })).toBe("TEACHER");
  });
});

describe("isManagementRole", () => {
  it("covers the headmaster and both deputies only", () => {
    expect(isManagementRole("HEADMASTER")).toBe(true);
    expect(isManagementRole("HEADTEACHER_A")).toBe(true);
    expect(isManagementRole("HEADTEACHER_B")).toBe(true);
    expect(isManagementRole("TEACHER")).toBe(false);
    expect(isManagementRole("STUDENT_COUNSELOR")).toBe(false);
    expect(isManagementRole(null)).toBe(false);
  });
});

describe("roleChangeError", () => {
  const base = { actorId: "admin", targetId: "t1", currentRole: "TEACHER" as const, newRole: "HEADTEACHER_B" as const };

  it("allows changing between educator roles", () => {
    expect(roleChangeError(base)).toBeNull();
  });

  it("refuses your own account", () => {
    expect(roleChangeError({ ...base, targetId: "admin" })).toBe("self");
  });

  it("refuses non-educator roles on either side", () => {
    expect(roleChangeError({ ...base, currentRole: "SCHOOL_ADMIN" })).toBe("notStaffRole");
    expect(roleChangeError({ ...base, newRole: "SUPER_ADMIN" })).toBe("notStaffRole");
    expect(roleChangeError({ ...base, currentRole: "PARENT", newRole: "TEACHER" })).toBe("notStaffRole");
  });

  it("reports no change", () => {
    expect(roleChangeError({ ...base, newRole: "TEACHER" })).toBe("noChange");
  });
});

describe("expectedSignupRole", () => {
  it("is the planned role when the admin set one", () => {
    expect(expectedSignupRole({ plannedRole: "HEADTEACHER_B", scheduleName: "Μ-ΧΩΡΙΣ ΣΗΜΑ Α." })).toBe("HEADTEACHER_B");
  });

  it("is the name marker's role otherwise", () => {
    expect(expectedSignupRole({ plannedRole: null, scheduleName: "Μ-ΑΛΦΑ Α. ΒΔ" })).toBe("HEADTEACHER_B");
  });

  it("expects nothing in particular for an unmarked name", () => {
    expect(expectedSignupRole({ plannedRole: null, scheduleName: "Μ-ΑΛΦΑ Α." })).toBeNull();
  });
});

describe("isDutyCandidate", () => {
  const base = { accountRole: null, accountActive: null, plannedRole: null, leftTimetable: false } as const;

  it("accepts Deputy A and B without an account, by marker or planned role", () => {
    expect(isDutyCandidate({ ...base, scheduleName: "Μ-ΑΛΦΑ Α. ΒΔ" })).toBe(true);
    expect(isDutyCandidate({ ...base, scheduleName: "Μ-ΑΛΦΑ Α. ΒΔΑ" })).toBe(true);
    expect(isDutyCandidate({ ...base, scheduleName: "Μ-ΧΩΡΙΣ ΣΗΜΑ Α.", plannedRole: "HEADTEACHER_A" })).toBe(true);
  });

  it("rejects teachers, the headmaster, and people who left the timetable", () => {
    expect(isDutyCandidate({ ...base, scheduleName: "Μ-ΑΛΦΑ Α." })).toBe(false);
    expect(isDutyCandidate({ ...base, scheduleName: "Ξ-ΑΝΔΡΕΟΥ Ι. Δ" })).toBe(false);
    expect(isDutyCandidate({ ...base, scheduleName: "Μ-ΑΛΦΑ Α. ΒΔ", leftTimetable: true })).toBe(false);
  });

  it("with an account, needs an active deputy role", () => {
    expect(isDutyCandidate({ ...base, scheduleName: "x", accountRole: "HEADTEACHER_A", accountActive: true })).toBe(true);
    expect(isDutyCandidate({ ...base, scheduleName: "x", accountRole: "HEADTEACHER_B", accountActive: false })).toBe(false);
    expect(isDutyCandidate({ ...base, scheduleName: "Μ-ΑΛΦΑ Α. ΒΔ", accountRole: "TEACHER", accountActive: true })).toBe(false);
  });
});
