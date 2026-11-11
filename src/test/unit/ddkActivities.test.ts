import { describe, it, expect } from "vitest";
import { categoryCodes, ddkActivityWhere, hasStudentScope, parseDdkActivityFilters, summarizeActivityAwards } from "@/lib/ddkActivities";
import { DDK_CATALOG } from "@/lib/ddk";

const code = DDK_CATALOG.find((c) => !c.autoOnly)!.code;
const section = DDK_CATALOG.find((c) => !c.autoOnly)!.section;

describe("parseDdkActivityFilters", () => {
  it("defaults to everything", () => {
    expect(parseDdkActivityFilters({})).toEqual({ status: "all", filer: null, category: null, grade: null, groupId: null, q: "" });
  });
  it("keeps valid values and drops unknown ones", () => {
    const f = parseDdkActivityFilters({ status: "pending", filer: " s1 ", category: code, grade: "2", groupId: "g", q: " Άλφα " });
    expect(f).toEqual({ status: "pending", filer: "s1", category: code, grade: 2, groupId: "g", q: "Άλφα" });
    expect(parseDdkActivityFilters({ status: "x", category: "ZZ9", grade: "7" })).toMatchObject({ status: "all", category: null, grade: null });
    expect(parseDdkActivityFilters({ category: `section:${section}` }).category).toBe(`section:${section}`);
  });
});

describe("categoryCodes", () => {
  it("expands a section to its codes and keeps a single code", () => {
    expect(categoryCodes(code)).toEqual([code]);
    const codes = categoryCodes(`section:${section}`);
    expect(codes).toContain(code);
    expect(codes.every((c) => DDK_CATALOG.find((x) => x.code === c)?.section === section)).toBe(true);
  });
});

describe("ddkActivityWhere", () => {
  const base = parseDdkActivityFilters({});
  it("matches everything with no filters", () => {
    expect(ddkActivityWhere(base)).toEqual({});
  });
  it("filters converted, pending and a teacher", () => {
    expect(ddkActivityWhere({ ...base, status: "converted" })).toEqual({ AND: [{ ddkAwards: { some: {} } }] });
    expect(ddkActivityWhere({ ...base, status: "pending", filer: "s1" })).toEqual({
      AND: [{ filerId: "s1" }, { ddkAwards: { none: {} } }],
    });
  });
  it("lets a category stand for converted", () => {
    expect(ddkActivityWhere({ ...base, status: "converted", category: code })).toEqual({
      AND: [{ ddkAwards: { some: { categoryCode: { in: [code] } } } }],
    });
  });
  it("filters by a participant's homegroup over the year, and by name or registry number", () => {
    const w = ddkActivityWhere({ ...base, grade: 2, groupId: "g", q: "12" }) as { AND: { participants: { some: { student: Record<string, unknown> } } }[] };
    const student = w.AND[0]!.participants.some.student;
    expect(student.groupId).toBe("g");
    expect(student.group).toBeUndefined();
    expect(student.OR).toHaveLength(2);
    const byYear = ddkActivityWhere({ ...base, grade: 3 }) as typeof w;
    expect(byYear.AND[0]!.participants.some.student).toEqual({ group: { grade: 3 } });
  });
});

describe("summarizeActivityAwards", () => {
  const award = (points: number, groupId: string, grade: number, name: string, registryNo: string) => ({
    points, categoryCode: "D1", student: { groupId, grade, name, registryNo },
  });
  const awards = [award(2, "a1", 1, "Άλφα", "101"), award(4, "a1", 1, "Βήτα", "102"), award(3, "b2", 2, "Γάμμα", "203")];
  const none = { grade: null, groupId: null, q: "" };

  it("adds every student's own points and gives the spread", () => {
    expect(summarizeActivityAwards(awards, none)).toEqual({ category: "D1", total: 9, students: 3, min: 2, max: 4, scoped: null });
  });
  it("adds only the matching students' points under a class, year or student filter", () => {
    expect(summarizeActivityAwards(awards, { ...none, groupId: "a1" }).scoped).toEqual({ students: 2, points: 6 });
    expect(summarizeActivityAwards(awards, { ...none, grade: 2 }).scoped).toEqual({ students: 1, points: 3 });
    expect(summarizeActivityAwards(awards, { ...none, q: "βήτ" }).scoped).toEqual({ students: 1, points: 4 });
    expect(summarizeActivityAwards(awards, { ...none, q: "20" }).scoped).toEqual({ students: 1, points: 3 });
    expect(hasStudentScope(none)).toBe(false);
  });
  it("handles an activity with no points", () => {
    expect(summarizeActivityAwards([], none)).toEqual({ category: null, total: 0, students: 0, min: 0, max: 0, scoped: null });
  });
});
