import { describe, it, expect } from "vitest";
import { overallStatus, referralColor } from "@/lib/referralStatus";

const students = (statuses: string[]) => statuses.map((status) => ({ status }));

describe("overallStatus", () => {
  it("is DRAFT for a draft regardless of students", () => {
    expect(overallStatus({ isDraft: true, students: students(["PENDING"]) })).toBe("DRAFT");
  });

  it("is PENDING when no student is resolved", () => {
    expect(overallStatus({ isDraft: false, students: students(["PENDING", "PENDING"]) })).toBe("PENDING");
  });

  it("is PARTIAL when some but not all are resolved", () => {
    expect(overallStatus({ isDraft: false, students: students(["RESOLVED", "PENDING"]) })).toBe("PARTIAL");
  });

  it("is RESOLVED when every student is resolved", () => {
    expect(overallStatus({ isDraft: false, students: students(["RESOLVED", "RESOLVED"]) })).toBe("RESOLVED");
  });

  it("is PENDING for a filed referral with no students", () => {
    expect(overallStatus({ isDraft: false, students: [] })).toBe("PENDING");
  });
});

describe("referralColor", () => {
  it("is GRAY for a draft", () => {
    expect(referralColor({ isDraft: true, openedAt: null, students: students(["PENDING"]) })).toBe("GRAY");
  });

  it("is RED when filed but not opened and nothing resolved", () => {
    expect(referralColor({ isDraft: false, openedAt: null, students: students(["PENDING", "PENDING"]) })).toBe("RED");
  });

  it("is YELLOW once opened even if nothing is resolved yet", () => {
    expect(
      referralColor({ isDraft: false, openedAt: new Date(), students: students(["PENDING", "PENDING"]) })
    ).toBe("YELLOW");
  });

  it("is YELLOW when partially resolved even without an explicit openedAt", () => {
    expect(
      referralColor({ isDraft: false, openedAt: null, students: students(["RESOLVED", "PENDING"]) })
    ).toBe("YELLOW");
  });

  it("is GREEN when every student is resolved", () => {
    expect(
      referralColor({ isDraft: false, openedAt: new Date(), students: students(["RESOLVED", "RESOLVED"]) })
    ).toBe("GREEN");
  });

  it("accepts an ISO string for openedAt", () => {
    expect(
      referralColor({ isDraft: false, openedAt: "2026-06-02T10:00:00Z", students: students(["PENDING"]) })
    ).toBe("YELLOW");
  });

  it("is RED for a filed referral with no students yet", () => {
    expect(referralColor({ isDraft: false, openedAt: null, students: [] })).toBe("RED");
  });
});
