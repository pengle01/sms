import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  rateLimit,
  resetRateLimit,
  allowRegistration,
  allowActivation,
  allowActivationCheck,
} from "@/server/rateLimit";

describe("rateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows up to max attempts then blocks", () => {
    const key = "test:a";
    resetRateLimit(key);
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 1000)).toBe(true);
    expect(rateLimit(key, 3, 1000)).toBe(false);
  });

  it("resets after the window elapses", () => {
    const key = "test:b";
    resetRateLimit(key);
    expect(rateLimit(key, 1, 1000)).toBe(true);
    expect(rateLimit(key, 1, 1000)).toBe(false);
    vi.advanceTimersByTime(1001);
    expect(rateLimit(key, 1, 1000)).toBe(true);
  });

  it("resetRateLimit clears the counter immediately", () => {
    const key = "test:c";
    resetRateLimit(key);
    expect(rateLimit(key, 1, 1000)).toBe(true);
    expect(rateLimit(key, 1, 1000)).toBe(false);
    resetRateLimit(key);
    expect(rateLimit(key, 1, 1000)).toBe(true);
  });

  it("tracks distinct keys independently", () => {
    resetRateLimit("test:d1");
    resetRateLimit("test:d2");
    expect(rateLimit("test:d1", 1, 1000)).toBe(true);
    expect(rateLimit("test:d1", 1, 1000)).toBe(false);
    expect(rateLimit("test:d2", 1, 1000)).toBe(true);
  });
});

// The bug these cover: registration was keyed on the IP alone, so five sign-ups
// exhausted it for everyone behind the same NAT address — a whole school.
describe("two-tier sign-up limits", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const clear = (scope: string, actor: string, ip: string) => {
    resetRateLimit(`${scope}:${actor}`);
    resetRateLimit(`${scope}-ip:${ip}`);
  };

  describe("allowRegistration", () => {
    it("lets many different people register from one IP", () => {
      const ip = "203.0.113.1";
      resetRateLimit(`register-ip:${ip}`);
      for (let i = 0; i < 20; i++) {
        resetRateLimit(`register:teacher${i}@school.cy`);
        expect(allowRegistration(ip, `teacher${i}@school.cy`).allowed).toBe(true);
      }
    });

    it("stops one email retrying past its own limit", () => {
      const ip = "203.0.113.2";
      const email = "spammer@school.cy";
      clear("register", email, ip);
      for (let i = 0; i < 5; i++) expect(allowRegistration(ip, email).allowed).toBe(true);
      expect(allowRegistration(ip, email)).toEqual({ allowed: false, tier: "actor" });
    });

    it("still lets a different email through from the same IP", () => {
      const ip = "203.0.113.3";
      clear("register", "a@school.cy", ip);
      resetRateLimit("register:b@school.cy");
      for (let i = 0; i < 6; i++) allowRegistration(ip, "a@school.cy");
      expect(allowRegistration(ip, "b@school.cy").allowed).toBe(true);
    });

    it("closes the IP gate once a flood exceeds it", () => {
      const ip = "203.0.113.4";
      resetRateLimit(`register-ip:${ip}`);
      for (let i = 0; i < 60; i++) {
        resetRateLimit(`register:f${i}@school.cy`);
        expect(allowRegistration(ip, `f${i}@school.cy`).allowed).toBe(true);
      }
      resetRateLimit("register:f60@school.cy");
      expect(allowRegistration(ip, "f60@school.cy")).toEqual({ allowed: false, tier: "ip" });
    });

    it("recovers after the window elapses", () => {
      const ip = "203.0.113.5";
      const email = "later@school.cy";
      clear("register", email, ip);
      for (let i = 0; i < 5; i++) allowRegistration(ip, email);
      expect(allowRegistration(ip, email).allowed).toBe(false);
      vi.advanceTimersByTime(60 * 60 * 1000 + 1);
      expect(allowRegistration(ip, email).allowed).toBe(true);
    });
  });

  describe("allowActivation", () => {
    it("lets a class activate together from one IP", () => {
      const ip = "203.0.113.6";
      resetRateLimit(`activate-ip:${ip}`);
      for (let i = 0; i < 30; i++) {
        resetRateLimit(`activate:CODE${i}`);
        expect(allowActivation(ip, `CODE${i}`).allowed).toBe(true);
      }
    });

    it("stops one access code being hammered", () => {
      const ip = "203.0.113.7";
      clear("activate", "ABCD2345", ip);
      for (let i = 0; i < 10; i++) expect(allowActivation(ip, "ABCD2345").allowed).toBe(true);
      expect(allowActivation(ip, "ABCD2345")).toEqual({ allowed: false, tier: "actor" });
    });
  });

  describe("allowActivationCheck", () => {
    it("tolerates a class checking codes in one lesson", () => {
      const ip = "203.0.113.8";
      resetRateLimit(`activate-check-ip:${ip}`);
      for (let i = 0; i < 150; i++) expect(allowActivationCheck(ip)).toBe(true);
    });

    it("still closes on a flood", () => {
      const ip = "203.0.113.9";
      resetRateLimit(`activate-check-ip:${ip}`);
      for (let i = 0; i < 150; i++) allowActivationCheck(ip);
      expect(allowActivationCheck(ip)).toBe(false);
    });
  });
});
