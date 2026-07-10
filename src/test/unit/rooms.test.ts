import { describe, it, expect } from "vitest";
import { DEFAULT_ROOMS, pickFreeRoom, parseRoomInput, roomOrder } from "@/lib/rooms";

const NAMES = DEFAULT_ROOMS.map((r) => r.name);

describe("Default room list", () => {
  it("has 89 rooms matching the school's rooms file", () => {
    expect(DEFAULT_ROOMS).toHaveLength(89);
  });

  it("has unique room names", () => {
    expect(new Set(NAMES).size).toBe(NAMES.length);
  });

  it("has a positive capacity for every room", () => {
    expect(DEFAULT_ROOMS.every((r) => Number.isInteger(r.capacity) && r.capacity > 0)).toBe(true);
  });

  it("never contains κιόσκια — it is a yard code, not a room", () => {
    expect(NAMES).not.toContain("κιόσκια");
    expect(NAMES).not.toContain("ΚΙΟΣΚΙΑ");
  });
});

describe("pickFreeRoom", () => {
  const rooms = [
    { name: "ΙΑΤΡ", capacity: 1 },
    { name: "40", capacity: 24 },
    { name: "44", capacity: 14 },
    { name: "130", capacity: 24 },
  ];

  it("picks the largest free room", () => {
    expect(pickFreeRoom(new Set(), rooms)).toBe("40");
  });

  it("breaks capacity ties by list order", () => {
    expect(pickFreeRoom(new Set(["40"]), rooms)).toBe("130");
  });

  it("skips occupied rooms down to smaller ones", () => {
    expect(pickFreeRoom(new Set(["40", "130"]), rooms)).toBe("44");
  });

  it("returns null when every room is taken", () => {
    expect(pickFreeRoom(new Set(["ΙΑΤΡ", "40", "44", "130"]), rooms)).toBe(null);
  });

  it("returns null when the room list is empty", () => {
    expect(pickFreeRoom(new Set(), [])).toBe(null);
  });
});

describe("parseRoomInput", () => {
  it("accepts a valid room and trims the name", () => {
    expect(parseRoomInput(" 107 ", 24)).toEqual({ ok: true, name: "107", capacity: 24 });
  });

  it("rejects empty or overlong names", () => {
    expect(parseRoomInput("   ", 10)).toEqual({ ok: false, error: "name" });
    expect(parseRoomInput("Α".repeat(21), 10)).toEqual({ ok: false, error: "name" });
  });

  it("rejects non-integer, zero, negative, or huge capacities", () => {
    expect(parseRoomInput("107", 0)).toEqual({ ok: false, error: "capacity" });
    expect(parseRoomInput("107", -3)).toEqual({ ok: false, error: "capacity" });
    expect(parseRoomInput("107", 2.5)).toEqual({ ok: false, error: "capacity" });
    expect(parseRoomInput("107", NaN)).toEqual({ ok: false, error: "capacity" });
    expect(parseRoomInput("107", 1000)).toEqual({ ok: false, error: "capacity" });
  });
});

describe("roomOrder", () => {
  it("sorts numerically, not lexicographically", () => {
    const sorted = [
      { name: "107", capacity: 1 },
      { name: "24α", capacity: 10 },
      { name: "6Β", capacity: 24 },
    ].sort(roomOrder);
    expect(sorted.map((r) => r.name)).toEqual(["6Β", "24α", "107"]);
  });
});
