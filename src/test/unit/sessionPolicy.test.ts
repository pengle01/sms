import { describe, it, expect } from "vitest";
import {
  sessionState,
  shouldRefresh,
  parseIdleMinutes,
  idleMinutesFor,
  absoluteEnd,
  cookieMaxAgeSeconds,
  toLogoutReason,
  STAFF_MAX_MS,
  FAMILY_MAX_MS,
} from "@/lib/sessionPolicy";

const MIN = 60_000;
const now = 1_800_000_000_000;

describe("sessionState — staff", () => {
  const staff = (o: Partial<{ loginAt: number; lastSeen: number; idleMin: number | null }>) => ({
    role: "TEACHER", loginAt: now - 60 * MIN, lastSeen: now - MIN, idleMin: 30, ...o,
  });

  it("is ok while active and within 12 hours", () => {
    expect(sessionState(staff({}), now)).toBe("ok");
  });

  it("is idle once the admin's idle minutes pass without activity", () => {
    expect(sessionState(staff({ lastSeen: now - 31 * MIN }), now)).toBe("idle");
    expect(sessionState(staff({ lastSeen: now - 30 * MIN }), now)).toBe("ok");
  });

  it("is expired after 12 hours even when active", () => {
    expect(sessionState(staff({ loginAt: now - STAFF_MAX_MS - 1, lastSeen: now }), now)).toBe("expired");
  });
});

describe("sessionState — parents and students", () => {
  it("never goes idle, expires after 7 days", () => {
    const fam = { role: "PARENT", loginAt: now - 2 * 24 * 60 * MIN, lastSeen: now - 2 * 24 * 60 * MIN, idleMin: null };
    expect(sessionState(fam, now)).toBe("ok");
    expect(sessionState({ ...fam, idleMin: 30 }, now)).toBe("ok"); // an idle value is ignored for families
    expect(sessionState({ ...fam, role: "STUDENT", loginAt: now - FAMILY_MAX_MS - 1 }, now)).toBe("expired");
  });
});

describe("sessionState — old tokens", () => {
  it("treats a token without the times as expired", () => {
    expect(sessionState({ role: "TEACHER" }, now)).toBe("expired");
    expect(sessionState({ role: "PARENT", loginAt: "x", lastSeen: now }, now)).toBe("expired");
  });
});

describe("shouldRefresh", () => {
  it("re-issues lastSeen at most once a minute", () => {
    expect(shouldRefresh(now - 59_000, now)).toBe(false);
    expect(shouldRefresh(now - 60_000, now)).toBe(true);
    expect(shouldRefresh(undefined, now)).toBe(true);
  });
});

describe("parseIdleMinutes", () => {
  it("defaults to 30 and keeps within 5–240", () => {
    expect(parseIdleMinutes(null)).toBe(30);
    expect(parseIdleMinutes("abc")).toBe(30);
    expect(parseIdleMinutes("2")).toBe(5);
    expect(parseIdleMinutes(1000)).toBe(240);
    expect(parseIdleMinutes("45")).toBe(45);
  });
});

describe("token values for a new login", () => {
  it("staff get the admin's idle minutes, families none", () => {
    expect(idleMinutesFor("TEACHER", 20)).toBe(20);
    expect(idleMinutesFor("SCHOOL_ADMIN", 20)).toBe(20);
    expect(idleMinutesFor("PARENT", 20)).toBeNull();
  });

  it("cookie lifetime: 12 h staff, 7 d families", () => {
    expect(cookieMaxAgeSeconds("TEACHER")).toBe(12 * 3600);
    expect(cookieMaxAgeSeconds("STUDENT")).toBe(7 * 24 * 3600);
  });

  it("absolute end is login time plus the maximum", () => {
    expect(absoluteEnd({ role: "TEACHER", loginAt: now })).toBe(now + STAFF_MAX_MS);
    expect(absoluteEnd({ role: "TEACHER" })).toBeNull();
  });
});

describe("toLogoutReason", () => {
  it("accepts only idle and expired", () => {
    expect(toLogoutReason("idle")).toBe("idle");
    expect(toLogoutReason("expired")).toBe("expired");
    expect(toLogoutReason("other")).toBeNull();
  });
});
