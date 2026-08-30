import { describe, it, expect } from "vitest";
import {
  canSendStaffNotifications,
  composeErrorKey,
  groupSentNotifications,
  type SentNotificationRow,
} from "@/lib/staffNotifications";

const row = (over: Partial<SentNotificationRow>): SentNotificationRow => ({
  title: "T",
  body: "B",
  createdAt: new Date("2026-03-16T09:00:00Z"),
  read: false,
  noticedAt: null,
  ...over,
});

describe("groupSentNotifications", () => {
  it("collapses rows sharing a title+body into one batch with a recipient total", () => {
    const out = groupSentNotifications([
      row({}),
      row({}),
      row({}),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].total).toBe(3);
  });

  it("counts a recipient as seen when read OR noticed", () => {
    const out = groupSentNotifications([
      row({ read: true }),
      row({ noticedAt: new Date() }),
      row({}), // unseen
    ]);
    expect(out[0].total).toBe(3);
    expect(out[0].seen).toBe(2);
  });

  it("keeps the latest createdAt as the batch sentAt", () => {
    const out = groupSentNotifications([
      row({ createdAt: new Date("2026-03-16T09:00:00Z") }),
      row({ createdAt: new Date("2026-03-16T11:00:00Z") }),
    ]);
    expect(out[0].sentAt.toISOString()).toBe("2026-03-16T11:00:00.000Z");
  });

  it("separates batches with different content and sorts newest first", () => {
    const out = groupSentNotifications([
      row({ title: "Old", createdAt: new Date("2026-03-10T09:00:00Z") }),
      row({ title: "New", createdAt: new Date("2026-03-16T09:00:00Z") }),
    ]);
    expect(out.map((b) => b.title)).toEqual(["New", "Old"]);
  });

  it("returns an empty array for no rows", () => {
    expect(groupSentNotifications([])).toEqual([]);
  });
});

describe("canSendStaffNotifications", () => {
  it("allows management, the counselor and the school office", () => {
    expect(canSendStaffNotifications(["HEADMASTER"])).toBe(true);
    expect(canSendStaffNotifications(["HEADTEACHER_A"])).toBe(true);
    expect(canSendStaffNotifications(["HEADTEACHER_B"])).toBe(true);
    expect(canSendStaffNotifications(["STUDENT_COUNSELOR"])).toBe(true);
    expect(canSendStaffNotifications(["SCHOOL_ADMIN"])).toBe(true);
  });

  it("denies a plain teacher", () => {
    // This fans out to every educator's inbox; it is not an everyday action.
    expect(canSendStaffNotifications(["TEACHER"])).toBe(false);
  });

  it("denies a bare system administrator", () => {
    // SUPER_ADMIN is not school staff; an admin grant sits on top of a real role.
    expect(canSendStaffNotifications(["SUPER_ADMIN"])).toBe(false);
  });

  it("counts a qualifying role held alongside another", () => {
    expect(canSendStaffNotifications(["TEACHER", "HEADTEACHER_B"])).toBe(true);
  });

  it("denies an empty role list", () => {
    expect(canSendStaffNotifications([])).toBe(false);
  });
});

describe("composeErrorKey", () => {
  it("passes every error the send can raise", () => {
    for (const k of ["title", "body", "recipients", "attachment"] as const) {
      expect(composeErrorKey(k)).toBe(k);
    }
  });

  it("drops anything else", () => {
    // err_attachment was missing from the message files, so a rejected upload
    // rendered a missing-key error; the allowlist keeps unknown values silent.
    expect(composeErrorKey("nonsense")).toBeNull();
    expect(composeErrorKey("")).toBeNull();
    expect(composeErrorKey(undefined)).toBeNull();
  });
});
