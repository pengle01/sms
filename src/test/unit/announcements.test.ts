import { describe, it, expect } from "vitest";
import { canManageAnnouncements, resolvePinnedUntil } from "@/lib/announcements";
import type { Role } from "@/generated/prisma";

describe("canManageAnnouncements", () => {
  it("allows headteachers and the headmaster", () => {
    expect(canManageAnnouncements(["HEADMASTER"])).toBe(true);
    expect(canManageAnnouncements(["HEADTEACHER_A"])).toBe(true);
    expect(canManageAnnouncements(["HEADTEACHER_B"])).toBe(true);
  });

  it("denies plain teachers and other roles", () => {
    expect(canManageAnnouncements(["TEACHER"])).toBe(false);
    expect(canManageAnnouncements(["STUDENT_COUNSELOR"])).toBe(false);
    expect(canManageAnnouncements(["SCHOOL_ADMIN"])).toBe(false);
  });

  it("allows a teacher who also holds a management role", () => {
    expect(canManageAnnouncements(["TEACHER", "HEADTEACHER_A"] as Role[])).toBe(true);
  });

  it("denies an empty role list", () => {
    expect(canManageAnnouncements([])).toBe(false);
  });
});

describe("resolvePinnedUntil", () => {
  const today = new Date("2026-03-16T09:30:00.000Z");

  it("defaults to today when input is empty or invalid", () => {
    expect(resolvePinnedUntil("", today).toISOString()).toBe("2026-03-16T00:00:00.000Z");
    expect(resolvePinnedUntil(null, today).toISOString()).toBe("2026-03-16T00:00:00.000Z");
    expect(resolvePinnedUntil("not-a-date", today).toISOString()).toBe("2026-03-16T00:00:00.000Z");
  });

  it("keeps a future date", () => {
    expect(resolvePinnedUntil("2026-03-20", today).toISOString()).toBe("2026-03-20T00:00:00.000Z");
  });

  it("clamps a past date up to today", () => {
    expect(resolvePinnedUntil("2026-03-01", today).toISOString()).toBe("2026-03-16T00:00:00.000Z");
  });

  it("treats today as valid (today-only)", () => {
    expect(resolvePinnedUntil("2026-03-16", today).toISOString()).toBe("2026-03-16T00:00:00.000Z");
  });
});
