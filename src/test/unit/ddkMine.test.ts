import { describe, it, expect } from "vitest";
import { groupAwardsByActivity, myDdkSummary, type MyDdkAward } from "@/lib/ddk";

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

  it("counts awards, distinct students and points", () => {
    expect(myDdkSummary(awards)).toEqual({ awards: 4, students: 3, points: 8 });
    expect(myDdkSummary([])).toEqual({ awards: 0, students: 0, points: 0 });
  });

  it("returns nothing for no awards", () => {
    expect(groupAwardsByActivity([])).toEqual([]);
  });
});
