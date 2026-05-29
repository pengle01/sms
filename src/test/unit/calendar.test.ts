import { describe, it, expect } from "vitest";
import { isHolidayType, buildDayTypeMap } from "@/lib/calendar";
import type { SpecialDayType } from "@/generated/prisma";

describe("isHolidayType", () => {
  it("returns true for BANK_HOLIDAY", () => {
    expect(isHolidayType("BANK_HOLIDAY")).toBe(true);
  });

  it("returns true for CHRISTMAS", () => {
    expect(isHolidayType("CHRISTMAS")).toBe(true);
  });

  it("returns true for EASTER", () => {
    expect(isHolidayType("EASTER")).toBe(true);
  });

  it("returns true for OTHER_HOLIDAY", () => {
    expect(isHolidayType("OTHER_HOLIDAY")).toBe(true);
  });

  it("returns false for INTERCALARY", () => {
    expect(isHolidayType("INTERCALARY")).toBe(false);
  });

  it("returns false for EXCURSION", () => {
    expect(isHolidayType("EXCURSION")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isHolidayType(null)).toBe(false);
  });
});

describe("buildDayTypeMap", () => {
  const day = (iso: string) => new Date(iso + "T00:00:00.000Z");

  const week = [
    day("2025-01-06"), // Mon
    day("2025-01-07"), // Tue
    day("2025-01-08"), // Wed
    day("2025-01-09"), // Thu
    day("2025-01-10"), // Fri
  ];

  it("maps a single-day event to exactly that day", () => {
    const specialDays = [
      { id: "1", type: "BANK_HOLIDAY" as SpecialDayType, startDate: day("2025-01-08"), endDate: day("2025-01-08"), label: null, createdAt: new Date(), intercalaryMeetingPeriod: null },
    ];
    const map = buildDayTypeMap(specialDays, week);
    expect(map.get("2025-01-08")).toBe("BANK_HOLIDAY");
    expect(map.has("2025-01-06")).toBe(false);
    expect(map.has("2025-01-10")).toBe(false);
  });

  it("maps a multi-day range across the whole week", () => {
    const specialDays = [
      { id: "1", type: "CHRISTMAS" as SpecialDayType, startDate: day("2025-01-06"), endDate: day("2025-01-10"), label: null, createdAt: new Date(), intercalaryMeetingPeriod: null },
    ];
    const map = buildDayTypeMap(specialDays, week);
    for (const d of week) {
      expect(map.get(d.toISOString().slice(0, 10))).toBe("CHRISTMAS");
    }
  });

  it("handles a range that partially overlaps the week", () => {
    const specialDays = [
      { id: "1", type: "EASTER" as SpecialDayType, startDate: day("2025-01-08"), endDate: day("2025-01-12"), label: null, createdAt: new Date(), intercalaryMeetingPeriod: null },
    ];
    const map = buildDayTypeMap(specialDays, week);
    expect(map.has("2025-01-06")).toBe(false);
    expect(map.has("2025-01-07")).toBe(false);
    expect(map.get("2025-01-08")).toBe("EASTER");
    expect(map.get("2025-01-09")).toBe("EASTER");
    expect(map.get("2025-01-10")).toBe("EASTER");
  });

  it("returns empty map when no special days", () => {
    expect(buildDayTypeMap([], week).size).toBe(0);
  });
});
