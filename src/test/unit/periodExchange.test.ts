import { describe, it, expect } from "vitest";
import { findExchanges, slotTeacherKey, type ExchangeSlot } from "@/lib/periodExchange";

const s = (id: string, staffId: string | null, groupId: string, dayOfWeek: number, period: number, staffName: string | null = null): ExchangeSlot =>
  ({ id, staffId, staffName, groupId, dayOfWeek, period });

describe("slotTeacherKey", () => {
  it("prefers the staff id, then the timetable name", () => {
    expect(slotTeacherKey({ staffId: "a", staffName: "X" })).toBe("id:a");
    expect(slotTeacherKey({ staffId: null, staffName: " X " })).toBe("name:X");
    expect(slotTeacherKey({ staffId: null, staffName: null })).toBeNull();
  });
});

describe("findExchanges", () => {
  it("offers another teacher's lesson to the same group when both are free", () => {
    const out = findExchanges(["id:me"], [
      s("m1", "me", "B31", 1, 2),
      s("o1", "bob", "B31", 3, 5),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].options.map((o) => o.id)).toEqual(["o1"]);
  });

  it("works across days and within the same day", () => {
    const out = findExchanges(["id:me"], [
      s("m1", "me", "B31", 1, 2),
      s("o1", "bob", "B31", 1, 6),
      s("o2", "ann", "B31", 4, 1),
    ]);
    expect(out[0].options.map((o) => o.id)).toEqual(["o1", "o2"]);
  });

  it("skips a lesson when I am busy at its time", () => {
    const out = findExchanges(["id:me"], [
      s("m1", "me", "B31", 1, 2),
      s("m2", "me", "B32", 3, 5),
      s("o1", "bob", "B31", 3, 5),
    ]);
    expect(out.find((x) => x.mine.id === "m1")!.options).toEqual([]);
  });

  it("skips a lesson when the other teacher is busy at mine", () => {
    const out = findExchanges(["id:me"], [
      s("m1", "me", "B31", 1, 2),
      s("o1", "bob", "B31", 3, 5),
      s("o2", "bob", "B40", 1, 2),
    ]);
    expect(out[0].options).toEqual([]);
  });

  it("never matches a different group", () => {
    const out = findExchanges(["id:me"], [
      s("m1", "me", "B31", 1, 2),
      s("o1", "bob", "B32", 3, 5),
    ]);
    expect(out[0].options).toEqual([]);
  });

  it("does not offer my own other lessons to the same group", () => {
    const out = findExchanges(["id:me"], [
      s("m1", "me", "B31", 1, 2),
      s("m2", "me", "B31", 2, 3),
    ]);
    expect(out.every((x) => x.options.length === 0)).toBe(true);
  });

  it("treats unclaimed slots by timetable name, both mine and theirs", () => {
    const out = findExchanges(["id:me", "name:ΠΑΠΑΣ"], [
      s("m1", null, "B31", 1, 2, "ΠΑΠΑΣ"),
      s("o1", null, "B31", 2, 4, "ΓΕΩΡΓΙΟΥ"),
      s("o2", null, "B50", 1, 2, "ΓΕΩΡΓΙΟΥ"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].options).toEqual([]);
  });

  it("lists my lessons in day and period order and keeps those without options", () => {
    const out = findExchanges(["id:me"], [
      s("m2", "me", "B32", 2, 1),
      s("m1", "me", "B31", 1, 4),
    ]);
    expect(out.map((x) => x.mine.id)).toEqual(["m1", "m2"]);
  });
});
