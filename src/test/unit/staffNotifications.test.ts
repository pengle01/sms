import { describe, it, expect } from "vitest";
import { groupSentNotifications, type SentNotificationRow } from "@/lib/staffNotifications";

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
