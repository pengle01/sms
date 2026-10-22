import { describe, it, expect } from "vitest";
import { testAudience, audienceGroupIds, parseStudentTestFilters, rangeEnd, filterAudience, type TaughtStudent } from "@/lib/studentTests";

// My groups: homegroup B31 (a, b, c) and the elective FYS (a, d from B32).
const students: TaughtStudent[] = [
  { id: "a", groupIds: ["B31", "FYS"] },
  { id: "b", groupIds: ["B31", "CHEM"] },
  { id: "c", groupIds: ["B31"] },
  { id: "d", groupIds: ["B32", "FYS"] },
];
const mine = ["B31", "FYS"];

describe("testAudience", () => {
  it("marks a test for my whole group as not partial", () => {
    // …and it also reaches "a" in my FYS elective group.
    expect(testAudience("B31", mine, students)).toEqual([
      { groupId: "B31", studentIds: ["a", "b", "c"], total: 3, partial: false },
      { groupId: "FYS", studentIds: ["a"], total: 2, partial: true },
    ]);
  });

  it("marks an elective test reaching only some of my group as partial", () => {
    expect(testAudience("CHEM", mine, students)).toEqual([
      { groupId: "B31", studentIds: ["b"], total: 3, partial: true },
    ]);
  });

  it("reports every group of mine the test reaches", () => {
    // B32's test reaches d, who is in my FYS group but not in B31.
    expect(testAudience("B32", mine, students)).toEqual([
      { groupId: "FYS", studentIds: ["d"], total: 2, partial: true },
    ]);
    const fys = testAudience("FYS", mine, students);
    expect(fys.map((r) => [r.groupId, r.partial])).toEqual([["B31", true], ["FYS", false]]);
  });

  it("returns nothing when none of my students sit the test", () => {
    expect(testAudience("G99", mine, students)).toEqual([]);
  });
});

describe("audienceGroupIds", () => {
  it("collects every group my students belong to, once", () => {
    expect(audienceGroupIds(students).sort()).toEqual(["B31", "B32", "CHEM", "FYS"]);
    expect(audienceGroupIds([])).toEqual([]);
  });
});

describe("parseStudentTestFilters", () => {
  it("reads valid values and ignores the rest", () => {
    expect(parseStudentTestFilters({ group: "B31", range: "week", type: "BIG", partial: "1" }, mine)).toEqual(
      { groupId: "B31", range: "week", type: "BIG", partialOnly: true }
    );
    expect(parseStudentTestFilters({ group: "NOT-MINE", range: "year", type: "x" }, mine)).toEqual(
      { groupId: null, range: "all", type: null, partialOnly: false }
    );
  });
});

describe("rangeEnd", () => {
  const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const iso = (x: Date | null) => x?.toISOString().slice(0, 10) ?? null;

  it("runs «this week» to Friday, and to the coming Friday at the weekend", () => {
    expect(iso(rangeEnd(d("2026-10-21"), "week"))).toBe("2026-10-23"); // Wed → Fri
    expect(iso(rangeEnd(d("2026-10-23"), "week"))).toBe("2026-10-23"); // Fri → Fri
    expect(iso(rangeEnd(d("2026-10-24"), "week"))).toBe("2026-10-30"); // Sat → next Fri
    expect(iso(rangeEnd(d("2026-10-25"), "week"))).toBe("2026-10-30"); // Sun → next Fri
  });

  it("covers 14 and 30 days including today, and nothing for «all»", () => {
    expect(iso(rangeEnd(d("2026-10-21"), "2weeks"))).toBe("2026-11-03");
    expect(iso(rangeEnd(d("2026-10-21"), "30days"))).toBe("2026-11-19");
    expect(rangeEnd(d("2026-10-21"), "all")).toBeNull();
  });
});

describe("filterAudience", () => {
  const rows = testAudience("B31", mine, students); // B31 whole + FYS partial
  const f = { groupId: null, range: "all" as const, type: null, partialOnly: false };

  it("keeps everything without filters", () => {
    expect(filterAudience(rows, f)).toHaveLength(2);
  });

  it("narrows to one of my groups, dropping tests that don't reach it", () => {
    expect(filterAudience(rows, { ...f, groupId: "B31" })!.map((r) => r.groupId)).toEqual(["B31"]);
    expect(filterAudience(testAudience("CHEM", mine, students), { ...f, groupId: "FYS" })).toBeNull();
  });

  it("with «only partial», keeps a test only if a remaining group is partial", () => {
    expect(filterAudience(rows, { ...f, partialOnly: true })).toHaveLength(2);
    expect(filterAudience(rows, { ...f, groupId: "B31", partialOnly: true })).toBeNull();
  });
});
