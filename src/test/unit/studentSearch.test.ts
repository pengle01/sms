import { describe, it, expect } from "vitest";
import { parseLocateTab, studentSearchWhere } from "@/lib/studentSearch";

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
