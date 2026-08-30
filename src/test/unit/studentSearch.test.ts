import { describe, it, expect } from "vitest";
import { pickQueryString } from "@/lib/listFilters";
import {
  LOCATE_KEYS,
  initialLocateTab,
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
describe("initialLocateTab", () => {
  it("honours an explicit tab whatever the query says", () => {
    expect(initialLocateTab("name", undefined)).toBe("name");
    expect(initialLocateTab("id", "x")).toBe("id");
    expect(initialLocateTab("group", "x")).toBe("group");
  });

  it("opens on the name tab for a bare ?q= link", () => {
    // An office bookmark from before the tabs existed: land on its results,
    // not on an empty group tab with the search hidden.
    expect(initialLocateTab(undefined, "Παπαδόπουλος")).toBe("name");
  });

  it("opens on the group tab when there is no query", () => {
    expect(initialLocateTab(undefined, undefined)).toBe("group");
    expect(initialLocateTab(undefined, "")).toBe("group");
    expect(initialLocateTab(undefined, "   ")).toBe("group");
  });

  it("does not let a query rescue an unknown tab", () => {
    expect(initialLocateTab("bogus", "x")).toBe("group");
  });
});

describe("LOCATE_KEYS", () => {
  it("is the set locateHref serialises", () => {
    expect([...LOCATE_KEYS]).toEqual(["tab", "grade", "groupId", "q"]);
  });

  it("round-trips the same string a locate href produces", () => {
    // The row link and the back link must agree, or filters die on the return trip.
    const current = { tab: "name", grade: "2", groupId: "g1", q: "παπ" };
    expect(pickQueryString(current, LOCATE_KEYS)).toBe(locateHref(current, {}));
  });
});
