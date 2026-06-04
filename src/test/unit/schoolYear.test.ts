import { describe, it, expect } from "vitest";
import {
  activeTermFor,
  configuredHolidayFor,
  parseConfigDate,
  resolveSchoolYear,
  schoolYearRanges,
  termOf,
} from "@/lib/schoolYear";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

describe("schoolYearRanges", () => {
  it("starts the year on 1 September of the same year for autumn dates", () => {
    const r = schoolYearRanges(utc(2025, 10, 15));
    expect(r.yearStart).toEqual(utc(2025, 9, 1));
    expect(r.term1End).toEqual(utc(2026, 2, 1)); // no gap by default
    expect(r.term2Start).toEqual(utc(2026, 2, 1));
    expect(r.yearEnd).toEqual(utc(2026, 9, 1));
    expect(r.christmas).toBeNull();
    expect(r.easter).toBeNull();
  });

  it("belongs to the previous year's start for spring dates", () => {
    const r = schoolYearRanges(utc(2026, 6, 4));
    expect(r.yearStart).toEqual(utc(2025, 9, 1));
    expect(r.term2Start).toEqual(utc(2026, 2, 1));
  });

  it("flips on 1 September exactly", () => {
    expect(schoolYearRanges(utc(2026, 8, 31)).yearStart).toEqual(utc(2025, 9, 1));
    expect(schoolYearRanges(utc(2026, 9, 1)).yearStart).toEqual(utc(2026, 9, 1));
  });
});

describe("termOf", () => {
  const r = schoolYearRanges(utc(2026, 3, 1)); // year 2025/26, no gap

  it("puts September–January in term 1", () => {
    expect(termOf(utc(2025, 9, 1), r)).toBe("TERM1");
    expect(termOf(utc(2026, 1, 31), r)).toBe("TERM1");
  });

  it("puts 1 February onward in term 2", () => {
    expect(termOf(utc(2026, 2, 1), r)).toBe("TERM2");
    expect(termOf(utc(2026, 5, 20), r)).toBe("TERM2");
  });

  it("returns null outside the school year", () => {
    expect(termOf(utc(2025, 8, 31), r)).toBeNull();
    expect(termOf(utc(2026, 9, 1), r)).toBeNull();
  });

  it("returns null in the gap between the terms", () => {
    const gapped = resolveSchoolYear(utc(2026, 3, 1), {
      term1Start: "2025-09-08",
      term1End: "2026-01-16",
      term2Start: "2026-02-02",
      term2End: "2026-06-30",
    });
    expect(termOf(utc(2026, 1, 16), gapped)).toBe("TERM1");
    expect(termOf(utc(2026, 1, 20), gapped)).toBeNull(); // between terms
    expect(termOf(utc(2026, 2, 2), gapped)).toBe("TERM2");
  });
});

describe("parseConfigDate", () => {
  it("parses YYYY-MM-DD to a UTC midnight", () => {
    expect(parseConfigDate("2026-02-15")).toEqual(utc(2026, 2, 15));
  });

  it("rejects missing, malformed, or impossible values", () => {
    expect(parseConfigDate(null)).toBeNull();
    expect(parseConfigDate("")).toBeNull();
    expect(parseConfigDate("15/02/2026")).toBeNull();
    expect(parseConfigDate("2026-13-40")).toBeNull();
  });
});

describe("resolveSchoolYear", () => {
  const now = utc(2026, 6, 4);

  it("uses the configured ministry dates, with inclusive end days", () => {
    const r = resolveSchoolYear(now, {
      term1Start: "2025-09-08",
      term1End: "2026-01-16",
      term2Start: "2026-01-26",
      term2End: "2026-06-30",
    });
    expect(r.yearStart).toEqual(utc(2025, 9, 8));
    expect(r.term1End).toEqual(utc(2026, 1, 17)); // 16 Jan inclusive → 17 exclusive
    expect(r.term2Start).toEqual(utc(2026, 1, 26));
    expect(r.yearEnd).toEqual(utc(2026, 7, 1)); // 30 Jun inclusive → 1 Jul exclusive
    expect(termOf(utc(2026, 6, 30), r)).toBe("TERM2");
    expect(termOf(utc(2026, 7, 1), r)).toBeNull();
  });

  it("parses the holiday ranges (end inclusive)", () => {
    const r = resolveSchoolYear(now, {
      christmasStart: "2025-12-24",
      christmasEnd: "2026-01-06",
      easterStart: "2026-04-13",
      easterEnd: "2026-04-26",
    });
    expect(r.christmas).toEqual({ start: utc(2025, 12, 24), end: utc(2026, 1, 7) });
    expect(r.easter).toEqual({ start: utc(2026, 4, 13), end: utc(2026, 4, 27) });
  });

  it("drops a holiday pair that is incomplete or reversed", () => {
    expect(resolveSchoolYear(now, { christmasStart: "2025-12-24" }).christmas).toBeNull();
    expect(
      resolveSchoolYear(now, { easterStart: "2026-04-26", easterEnd: "2026-04-13" }).easter
    ).toBeNull();
  });

  it("falls back to defaults for missing or invalid term fields", () => {
    const r = resolveSchoolYear(now, { term2Start: "2026-02-09" });
    expect(r.yearStart).toEqual(utc(2025, 9, 1)); // default
    expect(r.term2Start).toEqual(utc(2026, 2, 9)); // configured
    expect(r.term1End).toEqual(utc(2026, 2, 9)); // defaults to Β΄ start (no gap)
    const bad = resolveSchoolYear(now, { term2Start: "not-a-date" });
    expect(bad).toEqual(schoolYearRanges(now));
  });

  it("ignores out-of-order term dates but keeps valid holidays", () => {
    const r = resolveSchoolYear(now, {
      term1Start: "2026-03-01",
      term2Start: "2026-01-26",
      term2End: "2026-06-30",
      christmasStart: "2025-12-24",
      christmasEnd: "2026-01-06",
    });
    const defaults = schoolYearRanges(now);
    expect(r.yearStart).toEqual(defaults.yearStart);
    expect(r.term2Start).toEqual(defaults.term2Start);
    expect(r.christmas).not.toBeNull();
  });
});

describe("configuredHolidayFor", () => {
  const r = resolveSchoolYear(utc(2026, 1, 1), {
    christmasStart: "2025-12-24",
    christmasEnd: "2026-01-06",
    easterStart: "2026-04-13",
    easterEnd: "2026-04-26",
  });

  it("detects both holiday ranges, inclusive of the last day", () => {
    expect(configuredHolidayFor(utc(2025, 12, 24), r)).toBe("CHRISTMAS");
    expect(configuredHolidayFor(utc(2026, 1, 6), r)).toBe("CHRISTMAS");
    expect(configuredHolidayFor(utc(2026, 4, 26), r)).toBe("EASTER");
  });

  it("returns null outside the holidays or when unconfigured", () => {
    expect(configuredHolidayFor(utc(2026, 1, 7), r)).toBeNull();
    expect(configuredHolidayFor(utc(2026, 3, 1), r)).toBeNull();
    expect(configuredHolidayFor(utc(2025, 12, 25), schoolYearRanges(utc(2026, 1, 1)))).toBeNull();
  });
});

describe("activeTermFor", () => {
  const config = {
    term1Start: "2025-09-01",
    term1End: "2026-01-07",
    term2Start: "2026-01-08",
    term2End: "2026-05-08",
    testDeadline2: "2026-04-28",
  };
  const ranges = resolveSchoolYear(utc(2026, 3, 1), config);

  it("returns the configured test deadline for the date's term", () => {
    const info = activeTermFor(utc(2026, 3, 1), ranges, config);
    expect(info).toEqual({ term: "TERM2", testDeadline: utc(2026, 4, 28) });
  });

  it("falls back to the end of the term when no deadline is configured", () => {
    const info = activeTermFor(utc(2025, 10, 1), ranges, config);
    expect(info?.term).toBe("TERM1");
    expect(info?.testDeadline).toEqual(utc(2026, 1, 7)); // last day of Α΄
  });

  it("returns null outside the school year", () => {
    expect(activeTermFor(utc(2026, 5, 9), ranges, config)).toBeNull();
    expect(activeTermFor(utc(2025, 8, 20), ranges, config)).toBeNull();
  });
});
