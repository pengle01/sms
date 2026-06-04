import { describe, it, expect } from "vitest";
import { parseReferralSearchTab, referralSearchWhere } from "@/lib/referralSearch";
import { resolutionSummary } from "@/lib/referralLabels";

describe("parseReferralSearchTab", () => {
  it("accepts known tabs and falls back to number", () => {
    expect(parseReferralSearchTab("student")).toBe("student");
    expect(parseReferralSearchTab("studentId")).toBe("studentId");
    expect(parseReferralSearchTab("filer")).toBe("filer");
    expect(parseReferralSearchTab("junk")).toBe("number");
    expect(parseReferralSearchTab(undefined)).toBe("number");
  });
});

describe("referralSearchWhere", () => {
  it("returns null for empty queries", () => {
    expect(referralSearchWhere("number", "")).toBeNull();
    expect(referralSearchWhere("student", "   ")).toBeNull();
  });

  it("matches the referral number, accepting a # prefix", () => {
    expect(referralSearchWhere("number", "42")).toEqual({ number: 42 });
    expect(referralSearchWhere("number", "#42")).toEqual({ number: 42 });
  });

  it("rejects non-numeric referral numbers", () => {
    expect(referralSearchWhere("number", "abc")).toBeNull();
    expect(referralSearchWhere("number", "-3")).toBeNull();
  });

  it("builds a student-name fragment", () => {
    expect(referralSearchWhere("student", "Μαρία")).toEqual({
      students: { some: { student: { user: { name: { contains: "Μαρία", mode: "insensitive" } } } } },
    });
  });

  it("builds a student-ID fragment", () => {
    expect(referralSearchWhere("studentId", "1234")).toEqual({
      students: { some: { student: { studentId: { contains: "1234", mode: "insensitive" } } } },
    });
  });

  it("matches the filer by schedule coding or account name", () => {
    expect(referralSearchWhere("filer", "ΜΑΣΙΑ")).toEqual({
      filer: {
        OR: [
          { scheduleName: { contains: "ΜΑΣΙΑ", mode: "insensitive" } },
          { user: { name: { contains: "ΜΑΣΙΑ", mode: "insensitive" } } },
        ],
      },
    });
  });
});

describe("resolutionSummary", () => {
  it("shows the action with the expulsion day count", () => {
    expect(resolutionSummary({ action: "DETENTION", expulsionDays: [{ date: new Date() }, { date: new Date() }] }))
      .toBe("Αποβολή · 2 ημέρες");
    expect(resolutionSummary({ action: "DETENTION", expulsionDays: [{ date: new Date() }] }))
      .toBe("Αποβολή · 1 ημέρα");
  });

  it("shows just the action when there are no days", () => {
    expect(resolutionSummary({ action: "WARNING" })).toBe("Προειδοποίηση");
    expect(resolutionSummary({ action: "UNKNOWN_ACTION" })).toBe("UNKNOWN_ACTION");
  });
});
