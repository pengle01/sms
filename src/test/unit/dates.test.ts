import { describe, it, expect, afterEach } from "vitest";
import { localDateStr, utcMidnight, monthStart, monthEnd, normalizeIsoDate, toAppTimeline, fromAppTimeline, getNow, testDateOverride } from "@/lib/dates";

describe("localDateStr", () => {
  it("formats a known date as YYYY-MM-DD", () => {
    const d = new Date("2024-03-15T12:00:00Z");
    // Result depends on local timezone — just verify format
    expect(localDateStr(d)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns today's date string by default", () => {
    expect(localDateStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("utcMidnight", () => {
  it("returns UTC midnight for a YYYY-MM-DD string", () => {
    const d = utcMidnight("2024-06-01");
    expect(d.toISOString()).toBe("2024-06-01T00:00:00.000Z");
  });

  it("preserves the date component regardless of local timezone offsets", () => {
    const d = utcMidnight("2024-12-31");
    expect(d.getUTCFullYear()).toBe(2024);
    expect(d.getUTCMonth()).toBe(11); // 0-indexed
    expect(d.getUTCDate()).toBe(31);
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
  });

  it("accepts a Date object and produces UTC midnight for that local date", () => {
    const d = utcMidnight(new Date("2025-01-20T10:00:00Z"));
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCSeconds()).toBe(0);
  });
});

describe("monthStart", () => {
  it("returns UTC midnight on the 1st of the given month", () => {
    const d = monthStart(2024, 3);
    expect(d.toISOString()).toBe("2024-03-01T00:00:00.000Z");
  });

  it("handles January correctly", () => {
    const d = monthStart(2025, 1);
    expect(d.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("handles December correctly", () => {
    const d = monthStart(2024, 12);
    expect(d.toISOString()).toBe("2024-12-01T00:00:00.000Z");
  });
});

describe("monthEnd", () => {
  it("returns the first day of the next month (exclusive end)", () => {
    const d = monthEnd(2024, 3);
    expect(d.toISOString()).toBe("2024-04-01T00:00:00.000Z");
  });

  it("wraps December into January of next year", () => {
    const d = monthEnd(2024, 12);
    expect(d.toISOString()).toBe("2025-01-01T00:00:00.000Z");
  });

  it("monthEnd equals monthStart of the next month", () => {
    expect(monthEnd(2024, 6).getTime()).toBe(monthStart(2024, 7).getTime());
    expect(monthEnd(2024, 12).getTime()).toBe(monthStart(2025, 1).getTime());
  });
});

describe("normalizeIsoDate", () => {
  it("keeps strict YYYY-MM-DD values", () => {
    expect(normalizeIsoDate("2026-03-09")).toBe("2026-03-09");
  });

  it("zero-pads single-digit month/day", () => {
    expect(normalizeIsoDate("2026-3-9")).toBe("2026-03-09");
    expect(normalizeIsoDate("2026-12-1")).toBe("2026-12-01");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeIsoDate(" 2026-03-09 ")).toBe("2026-03-09");
  });

  it("rejects garbage so getNow falls back to the real date", () => {
    expect(normalizeIsoDate(undefined)).toBeNull();
    expect(normalizeIsoDate(null)).toBeNull();
    expect(normalizeIsoDate("")).toBeNull();
    expect(normalizeIsoDate("not a date")).toBeNull();
    expect(normalizeIsoDate("2026-13-40")).toBeNull();
    expect(normalizeIsoDate("16-03-2026")).toBeNull();
  });
});

describe("App timeline shift (NEXT_PUBLIC_TEST_DATE)", () => {
  const ORIG = process.env.NEXT_PUBLIC_TEST_DATE;
  afterEach(() => {
    if (ORIG === undefined) delete process.env.NEXT_PUBLIC_TEST_DATE;
    else process.env.NEXT_PUBLIC_TEST_DATE = ORIG;
  });

  it("is the identity without an override", () => {
    delete process.env.NEXT_PUBLIC_TEST_DATE;
    const d = new Date("2026-06-05T10:00:00Z");
    expect(toAppTimeline(d).getTime()).toBe(d.getTime());
    expect(fromAppTimeline(d).getTime()).toBe(d.getTime());
  });

  it("shifts a real timestamp onto the faked day", () => {
    const realToday = new Date().toLocaleDateString("en-CA");
    process.env.NEXT_PUBLIC_TEST_DATE = "2026-03-16";
    const noon = new Date(realToday + "T12:00:00.000Z");
    expect(toAppTimeline(noon).toISOString()).toBe("2026-03-16T12:00:00.000Z");
  });

  it("fromAppTimeline inverts toAppTimeline", () => {
    process.env.NEXT_PUBLIC_TEST_DATE = "2026-03-16";
    const d = new Date("2026-06-05T08:30:00Z");
    expect(fromAppTimeline(toAppTimeline(d)).getTime()).toBe(d.getTime());
  });
});

describe("getNow / testDateOverride", () => {
  const ORIG = process.env.NEXT_PUBLIC_TEST_DATE;
  afterEach(() => {
    if (ORIG === undefined) delete process.env.NEXT_PUBLIC_TEST_DATE;
    else process.env.NEXT_PUBLIC_TEST_DATE = ORIG;
  });

  it("returns the real date when no override is set", () => {
    delete process.env.NEXT_PUBLIC_TEST_DATE;
    expect(testDateOverride()).toBeNull();
    expect(localDateStr(getNow())).toBe(new Date().toLocaleDateString("en-CA"));
  });

  it("returns the faked calendar day when an override is set", () => {
    process.env.NEXT_PUBLIC_TEST_DATE = "2026-03-16";
    expect(testDateOverride()).toBe("2026-03-16");
    expect(localDateStr(getNow())).toBe("2026-03-16");
  });

  // The faked day carries the REAL time of day, so "is it past period 3" and
  // day-of-week logic keep working while the date is pinned.
  it("keeps the real time of day on the faked date", () => {
    process.env.NEXT_PUBLIC_TEST_DATE = "2026-03-16";
    const real = new Date();
    const now = getNow();
    expect(now.getHours()).toBe(real.getHours());
    expect(now.getDay()).toBe(1); // 2026-03-16 is a Monday
  });

  it("normalizes a single-digit override", () => {
    process.env.NEXT_PUBLIC_TEST_DATE = "2026-3-9";
    expect(testDateOverride()).toBe("2026-03-09");
    expect(localDateStr(getNow())).toBe("2026-03-09");
  });

  it("falls back to the real date on a malformed or empty override", () => {
    const realKey = new Date().toLocaleDateString("en-CA");
    for (const bad of ["", "   ", "not a date", "16-03-2026", "2026-13-40"]) {
      process.env.NEXT_PUBLIC_TEST_DATE = bad;
      expect(testDateOverride()).toBeNull();
      expect(localDateStr(getNow())).toBe(realKey);
    }
  });
});
