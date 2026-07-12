import { describe, it, expect } from "vitest";
import { parseDisplayDate, displayDateText } from "@/lib/dateInput";

describe("parseDisplayDate", () => {
  it("parses DD/MM/YY with two-digit year as 20YY", () => {
    expect(parseDisplayDate("15/01/26")).toBe("2026-01-15");
  });

  it("parses DD/MM/YYYY", () => {
    expect(parseDisplayDate("15/01/2026")).toBe("2026-01-15");
  });

  it("parses single-digit day and month", () => {
    expect(parseDisplayDate("5/9/25")).toBe("2025-09-05");
  });

  it("accepts dot and dash separators", () => {
    expect(parseDisplayDate("5.9.25")).toBe("2025-09-05");
    expect(parseDisplayDate("5-9-25")).toBe("2025-09-05");
  });

  it("accepts pasted ISO dates", () => {
    expect(parseDisplayDate("2026-01-15")).toBe("2026-01-15");
    expect(parseDisplayDate("2026-1-5")).toBe("2026-01-05");
  });

  it("trims surrounding whitespace", () => {
    expect(parseDisplayDate(" 15/01/26 ")).toBe("2026-01-15");
  });

  it("returns null for empty input", () => {
    expect(parseDisplayDate("")).toBeNull();
    expect(parseDisplayDate("   ")).toBeNull();
  });

  it("returns null for impossible calendar dates", () => {
    expect(parseDisplayDate("31/02/26")).toBeNull();
    expect(parseDisplayDate("32/01/26")).toBeNull();
    expect(parseDisplayDate("15/13/26")).toBeNull();
    expect(parseDisplayDate("0/1/26")).toBeNull();
  });

  it("handles leap years", () => {
    expect(parseDisplayDate("29/02/24")).toBe("2024-02-29");
    expect(parseDisplayDate("29/02/25")).toBeNull();
  });

  it("returns null for garbage and partial input", () => {
    expect(parseDisplayDate("abc")).toBeNull();
    expect(parseDisplayDate("15/01")).toBeNull();
    expect(parseDisplayDate("15/01/2")).toBeNull();
    expect(parseDisplayDate("15/01/202")).toBeNull();
  });

  it("rejects mixed separators", () => {
    expect(parseDisplayDate("15/01.26")).toBeNull();
  });
});

describe("displayDateText", () => {
  it("formats ISO to DD/MM/YY", () => {
    expect(displayDateText("2026-01-15")).toBe("15/01/26");
  });

  it("returns empty string for empty or missing values", () => {
    expect(displayDateText("")).toBe("");
    expect(displayDateText(null)).toBe("");
    expect(displayDateText(undefined)).toBe("");
  });

  it("returns empty string for non-ISO input", () => {
    expect(displayDateText("15/01/26")).toBe("");
  });

  it("round-trips with parseDisplayDate", () => {
    expect(parseDisplayDate(displayDateText("2025-09-05"))).toBe("2025-09-05");
  });
});
