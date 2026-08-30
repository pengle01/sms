import { describe, it, expect } from "vitest";
import {
  announcementErrorKey,
  canDeleteAnnouncement,
  canManageAnnouncements,
  resolvePinnedUntil,
} from "@/lib/announcements";
import type { Role } from "@/generated/prisma/client";

describe("canManageAnnouncements", () => {
  it("allows headteachers and the headmaster", () => {
    expect(canManageAnnouncements(["HEADMASTER"])).toBe(true);
    expect(canManageAnnouncements(["HEADTEACHER_A"])).toBe(true);
    expect(canManageAnnouncements(["HEADTEACHER_B"])).toBe(true);
  });

  it("allows the school office", () => {
    // Deliberate widening: the secretary's own board (Notices) is not readable
    // outside the office and admin portals, so an announcement is the only way
    // she can reach the teaching staff.
    expect(canManageAnnouncements(["SCHOOL_ADMIN"])).toBe(true);
  });

  it("denies plain teachers and other roles", () => {
    expect(canManageAnnouncements(["TEACHER"])).toBe(false);
    expect(canManageAnnouncements(["STUDENT_COUNSELOR"])).toBe(false);
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

describe("canDeleteAnnouncement", () => {
  const MINE = "u_me";
  const THEIRS = "u_them";

  it("lets an author remove their own", () => {
    expect(canDeleteAnnouncement(["SCHOOL_ADMIN"], MINE, MINE)).toBe(true);
    expect(canDeleteAnnouncement(["HEADTEACHER_B"], MINE, MINE)).toBe(true);
  });

  it("keeps management's peer rule — a headteacher may clear any", () => {
    expect(canDeleteAnnouncement(["HEADMASTER"], THEIRS, MINE)).toBe(true);
    expect(canDeleteAnnouncement(["HEADTEACHER_A"], THEIRS, MINE)).toBe(true);
  });

  it("does not let the office remove a headteacher's", () => {
    // Widening "may post" to the secretary must not also hand her the power to
    // take down the headmaster's announcement.
    expect(canDeleteAnnouncement(["SCHOOL_ADMIN"], THEIRS, MINE)).toBe(false);
  });

  it("refuses a role that may not post at all, even as author", () => {
    expect(canDeleteAnnouncement(["TEACHER"], MINE, MINE)).toBe(false);
  });

  it("refuses when there is no viewer", () => {
    expect(canDeleteAnnouncement(["HEADMASTER"], THEIRS, null)).toBe(false);
    expect(canDeleteAnnouncement(["HEADMASTER"], THEIRS, "")).toBe(false);
  });
});

describe("announcementErrorKey", () => {
  it("passes the errors the composer can raise", () => {
    expect(announcementErrorKey("body")).toBe("body");
    expect(announcementErrorKey("attachment")).toBe("attachment");
  });

  it("drops anything else so a hand-edited URL cannot throw", () => {
    expect(announcementErrorKey("nonsense")).toBeNull();
    expect(announcementErrorKey("")).toBeNull();
    expect(announcementErrorKey(undefined)).toBeNull();
    expect(announcementErrorKey(null)).toBeNull();
  });
});
