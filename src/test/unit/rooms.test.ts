import { describe, it, expect } from "vitest";
import { ROOMS, ROOM_NAMES, isKnownRoom, pickFreeRoom } from "@/lib/rooms";

describe("Room list", () => {
  it("has 89 rooms matching the school's rooms file", () => {
    expect(ROOMS).toHaveLength(89);
    expect(ROOM_NAMES).toHaveLength(89);
  });

  it("has unique room names", () => {
    expect(new Set(ROOM_NAMES).size).toBe(ROOM_NAMES.length);
  });

  it("has a positive capacity for every room", () => {
    expect(ROOMS.every((r) => Number.isInteger(r.capacity) && r.capacity > 0)).toBe(true);
  });

  it("recognizes known rooms, including Greek-lettered ones", () => {
    expect(isKnownRoom("107")).toBe(true);
    expect(isKnownRoom("ΒΙΒΛ")).toBe(true);
    expect(isKnownRoom("24α")).toBe(true);
    expect(isKnownRoom("Β54")).toBe(true);
  });

  it("trims surrounding whitespace before matching", () => {
    expect(isKnownRoom(" 107 ")).toBe(true);
  });

  it("rejects unknown or empty room names", () => {
    expect(isKnownRoom("999")).toBe(false);
    expect(isKnownRoom("")).toBe(false);
    expect(isKnownRoom("B54")).toBe(false); // Latin B, not Greek Β
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

  it("never offers κιόσκια — it is not on the school list", () => {
    expect(ROOM_NAMES).not.toContain("κιόσκια");
    expect(ROOM_NAMES).not.toContain("ΚΙΟΣΚΙΑ");
    expect(pickFreeRoom(new Set(ROOM_NAMES))).toBe(null);
  });
});
