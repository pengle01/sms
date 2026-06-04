import { describe, it, expect } from "vitest";
import {
  locateHref,
  parseLocateTab,
  studentNameOrIdWhere,
  studentSearchWhere,
} from "@/lib/studentSearch";

describe("parseLocateTab", () => {
  it("returns the tab for known values", () => {
    expect(parseLocateTab("name")).toBe("name");
    expect(parseLocateTab("id")).toBe("id");
    expect(parseLocateTab("group")).toBe("group");
  });

  it("defaults to group for unknown or missing values", () => {
    expect(parseLocateTab(undefined)).toBe("group");
    expect(parseLocateTab(null)).toBe("group");
    expect(parseLocateTab("")).toBe("group");
    expect(parseLocateTab("bogus")).toBe("group");
  });
});

describe("studentSearchWhere", () => {
  it("returns null for empty or whitespace-only queries", () => {
    expect(studentSearchWhere("name", "")).toBeNull();
    expect(studentSearchWhere("name", "   ")).toBeNull();
    expect(studentSearchWhere("id", "\t")).toBeNull();
  });

  it("builds a case-insensitive name search scoped to active users", () => {
    expect(studentSearchWhere("name", "  Andreou  ")).toEqual({
      user: { name: { contains: "Andreou", mode: "insensitive" }, isActive: true },
    });
  });

  it("builds a student-ID search scoped to active users", () => {
    expect(studentSearchWhere("id", "12345")).toEqual({
      studentId: { contains: "12345", mode: "insensitive" },
      user: { isActive: true },
    });
  });
});

describe("studentNameOrIdWhere", () => {
  it("returns null for empty or whitespace-only queries", () => {
    expect(studentNameOrIdWhere("")).toBeNull();
    expect(studentNameOrIdWhere("   ")).toBeNull();
  });

  it("matches name OR student ID, scoped to active users", () => {
    expect(studentNameOrIdWhere(" 1234 ")).toEqual({
      OR: [
        { user: { name: { contains: "1234", mode: "insensitive" } } },
        { studentId: { contains: "1234", mode: "insensitive" } },
      ],
      user: { isActive: true },
    });
  });
});

describe("locateHref", () => {
  it("keeps current filters when only the tab changes", () => {
    expect(locateHref({ tab: "group", grade: "2", groupId: "g1", q: "παπ" }, { tab: "name" })).toBe(
      `?tab=name&grade=2&groupId=g1&q=${encodeURIComponent("παπ")}`
    );
  });

  it("overrides a single param without touching the rest", () => {
    expect(locateHref({ tab: "group", grade: "2", groupId: "g1" }, { groupId: "g2" })).toBe(
      "?tab=group&grade=2&groupId=g2"
    );
  });

  it("drops a param when the override is undefined", () => {
    expect(locateHref({ tab: "group", grade: "1", groupId: "g1" }, { grade: "3", groupId: undefined })).toBe(
      "?tab=group&grade=3"
    );
  });

  it("omits empty values entirely", () => {
    expect(locateHref({ tab: "group", q: "" }, {})).toBe("?tab=group");
  });
});