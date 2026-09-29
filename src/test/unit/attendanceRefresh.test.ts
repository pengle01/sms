import { describe, it, expect } from "vitest";
import { markAttendanceSaved, takeAttendanceSaved } from "@/lib/attendanceRefresh";

function memoryStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("attendance refresh handshake", () => {
  it("is false when nothing was saved", () => {
    expect(takeAttendanceSaved(memoryStore())).toBe(false);
  });

  it("is true once after a save, then false again", () => {
    const s = memoryStore();
    markAttendanceSaved(s);
    expect(takeAttendanceSaved(s)).toBe(true);
    expect(takeAttendanceSaved(s)).toBe(false);
  });

  it("tolerates storage that throws or is missing", () => {
    const broken = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    expect(() => markAttendanceSaved(broken)).not.toThrow();
    expect(takeAttendanceSaved(broken)).toBe(false);
    expect(takeAttendanceSaved(null)).toBe(false);
  });
});
