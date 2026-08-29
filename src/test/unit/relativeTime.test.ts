import { describe, it, expect } from "vitest";
import { relativeTime } from "@/lib/relativeTime";

const NOW = new Date("2026-03-16T12:00:00.000Z").getTime();
const ago = (ms: number) => new Date(NOW - ms);
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

describe("relativeTime", () => {
  it("reports anything under a minute as just now", () => {
    expect(relativeTime(ago(0), NOW)).toEqual({ unit: "now" });
    expect(relativeTime(ago(59_000), NOW)).toEqual({ unit: "now" });
  });

  it("counts whole minutes up to an hour", () => {
    expect(relativeTime(ago(MIN), NOW)).toEqual({ unit: "minutes", value: 1 });
    expect(relativeTime(ago(59 * MIN), NOW)).toEqual({ unit: "minutes", value: 59 });
  });

  it("switches to hours at exactly one hour", () => {
    expect(relativeTime(ago(HOUR), NOW)).toEqual({ unit: "hours", value: 1 });
    expect(relativeTime(ago(23 * HOUR), NOW)).toEqual({ unit: "hours", value: 23 });
  });

  it("switches to days at exactly 24 hours and does not roll up further", () => {
    expect(relativeTime(ago(DAY), NOW)).toEqual({ unit: "days", value: 1 });
    expect(relativeTime(ago(400 * DAY), NOW)).toEqual({ unit: "days", value: 400 });
  });

  it("truncates rather than rounds", () => {
    expect(relativeTime(ago(119 * MIN), NOW)).toEqual({ unit: "hours", value: 1 });
    expect(relativeTime(ago(47 * HOUR), NOW)).toEqual({ unit: "days", value: 1 });
  });

  it("treats a future timestamp as just now", () => {
    // Server/browser clock skew must never produce "-1 minutes ago".
    expect(relativeTime(new Date(NOW + 5 * MIN), NOW)).toEqual({ unit: "now" });
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(relativeTime(ago(5 * MIN).toISOString(), NOW)).toEqual({ unit: "minutes", value: 5 });
  });
});
