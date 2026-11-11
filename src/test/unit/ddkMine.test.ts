import { describe, it, expect } from "vitest";
import { duplicateDdkAwards, groupAwardsByActivity, myDdkSummary, type MyDdkAward } from "@/lib/ddk";

const act = (id: string, iso: string, name = id) => ({ id, name, date: new Date(`${iso}T00:00:00.000Z`) });
const award = (id: string, studentId: string, studentName: string, points: number, activity: MyDdkAward["activity"]): MyDdkAward => ({
  id,
  studentId,
  studentName,
  registryNo: null,
  groupName: null,
  categoryCode: "A1",
  points,
  note: null,
  activity,
});

describe("Τα ΔΔΚ μου", () => {
  const theatre = act("t", "2026-10-20", "Θέατρο");
  const trip = act("e", "2026-09-15", "Εκδρομή");
  const awards = [
    award("1", "s2", "Μαρία", 3, theatre),
    award("2", "s1", "Ανδρέας", 2, theatre),
    award("3", "s1", "Ανδρέας", 1, trip),
    award("4", "s3", "Γιώργος", 2, null),
  ];

  it("groups by activity, newest first, with no-activity awards last", () => {
    const groups = groupAwardsByActivity(awards);
    expect(groups.map((g) => g.activity?.name ?? null)).toEqual(["Θέατρο", "Εκδρομή", null]);
    expect(groups[0]!.points).toBe(5);
    expect(groups[0]!.awards.map((a) => a.studentName)).toEqual(["Ανδρέας", "Μαρία"]);
  });

  it("counts awards, distinct students and points, leaving out deleted activities", () => {
    expect(myDdkSummary(awards)).toEqual({ awards: 3, students: 2, points: 6 });
    expect(myDdkSummary([])).toEqual({ awards: 0, students: 0, points: 0 });
  });

  it("returns nothing for no awards", () => {
    expect(groupAwardsByActivity([])).toEqual([]);
  });
});

describe("duplicateDdkAwards", () => {
  const row = (id: string, activityId: string | null, studentId: string, minute: number) => ({
    id, activityId, studentId, createdAt: new Date(Date.UTC(2026, 10, 10, 9, minute)),
  });

  it("keeps each student's first row per activity and returns the repeats", () => {
    const { ids, byActivity } = duplicateDdkAwards([
      row("a", "act", "s1", 0),
      row("b", "act", "s1", 1),
      row("c", "act", "s1", 2),
      row("d", "act", "s2", 0),
      row("e", "act", "s2", 3),
      row("f", "other", "s1", 5),
    ]);
    expect(ids.sort()).toEqual(["b", "c", "e"]);
    expect(byActivity.get("act")).toEqual({ extra: 3, students: 2 });
    expect(byActivity.has("other")).toBe(false);
  });

  it("ignores rows of deleted activities and finds nothing when each student has one row", () => {
    expect(duplicateDdkAwards([row("a", null, "s1", 0), row("b", null, "s1", 1)]).ids).toEqual([]);
    expect(duplicateDdkAwards([row("a", "act", "s1", 0), row("b", "act", "s2", 0)]).ids).toEqual([]);
  });

  it("keeps the earliest even when the rows arrive out of order", () => {
    expect(duplicateDdkAwards([row("late", "act", "s1", 9), row("early", "act", "s1", 1)]).ids).toEqual(["late"]);
  });
});
