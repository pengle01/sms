import { describe, it, expect } from "vitest";

// Pure logic extracted from attendance mutation
function shouldAutoAbsent(minutesDelayed: number, threshold: number): boolean {
  return minutesDelayed > threshold;
}

function resolveStatus(
  minutesDelayed: number,
  threshold: number,
  inputStatus: "PRESENT" | "ABSENT" | "LATE" | "EXCUSED"
): "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" {
  return shouldAutoAbsent(minutesDelayed, threshold) ? "ABSENT" : inputStatus;
}

describe("Attendance delay logic", () => {
  const DEFAULT_THRESHOLD = 15;

  it("flags as absent when delay exceeds threshold", () => {
    expect(shouldAutoAbsent(16, DEFAULT_THRESHOLD)).toBe(true);
    expect(shouldAutoAbsent(30, DEFAULT_THRESHOLD)).toBe(true);
    expect(shouldAutoAbsent(60, DEFAULT_THRESHOLD)).toBe(true);
  });

  it("does not flag when delay is at or below threshold", () => {
    expect(shouldAutoAbsent(15, DEFAULT_THRESHOLD)).toBe(false);
    expect(shouldAutoAbsent(0, DEFAULT_THRESHOLD)).toBe(false);
    expect(shouldAutoAbsent(14, DEFAULT_THRESHOLD)).toBe(false);
  });

  it("overrides LATE to ABSENT when delay exceeds threshold", () => {
    expect(resolveStatus(20, DEFAULT_THRESHOLD, "LATE")).toBe("ABSENT");
  });

  it("preserves status when delay is within threshold", () => {
    expect(resolveStatus(5, DEFAULT_THRESHOLD, "LATE")).toBe("LATE");
    expect(resolveStatus(0, DEFAULT_THRESHOLD, "PRESENT")).toBe("PRESENT");
  });

  it("works with custom thresholds", () => {
    expect(shouldAutoAbsent(10, 5)).toBe(true);
    expect(shouldAutoAbsent(5, 5)).toBe(false);
    expect(shouldAutoAbsent(3, 5)).toBe(false);
  });
});
