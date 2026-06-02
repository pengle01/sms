import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { rateLimit, resetRateLimit } from "@/server/rateLimit";

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
