import { describe, it, expect } from "vitest";
import {
  parseSmsStatus,
  parseSmsKind,
  parseSmsLogPage,
  smsLogPageCount,
  smsLogWhere,
  smsSenderLabel,
  SMS_LOG_PAGE_SIZE,
} from "@/lib/smsLog";

describe("parseSmsStatus", () => {
  it("accepts the two real statuses", () => {
    expect(parseSmsStatus("SENT")).toBe("SENT");
    expect(parseSmsStatus("FAILED")).toBe("FAILED");
  });

  it("rejects anything else", () => {
    expect(parseSmsStatus("sent")).toBeNull();
    expect(parseSmsStatus("PENDING")).toBeNull();
    expect(parseSmsStatus(undefined)).toBeNull();
    expect(parseSmsStatus(null)).toBeNull();
  });
});

describe("parseSmsKind", () => {
  it("accepts the three sources", () => {
    expect(parseSmsKind("BROADCAST")).toBe("BROADCAST");
    expect(parseSmsKind("ABSENCE")).toBe("ABSENCE");
    expect(parseSmsKind("REFERRAL")).toBe("REFERRAL");
  });

  it("rejects anything else", () => {
    expect(parseSmsKind("OTHER")).toBeNull();
    expect(parseSmsKind(undefined)).toBeNull();
  });
});

describe("parseSmsLogPage", () => {
  it("defaults to the first page", () => {
    expect(parseSmsLogPage(undefined)).toBe(1);
    expect(parseSmsLogPage("")).toBe(1);
  });

  it("never returns a page below 1", () => {
    expect(parseSmsLogPage("0")).toBe(1);
    expect(parseSmsLogPage("-4")).toBe(1);
    expect(parseSmsLogPage("nonsense")).toBe(1);
  });

  it("reads a real page number", () => {
    expect(parseSmsLogPage("7")).toBe(7);
  });
});

describe("smsLogPageCount", () => {
  it("is 1 for an empty log", () => {
    expect(smsLogPageCount(0)).toBe(1);
  });

  it("rounds a partial page up", () => {
    expect(smsLogPageCount(SMS_LOG_PAGE_SIZE + 1)).toBe(2);
  });

  it("does not add an empty page on an exact multiple", () => {
    expect(smsLogPageCount(SMS_LOG_PAGE_SIZE * 3)).toBe(3);
  });
});

describe("smsLogWhere", () => {
  const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  it("is empty when nothing is set", () => {
    expect(smsLogWhere({})).toEqual({});
  });

  it("filters from a start date", () => {
    expect(smsLogWhere({ from: day("2026-03-01") })).toEqual({
      sentAt: { gte: day("2026-03-01") },
    });
  });

  it("treats the end date as an inclusive day", () => {
    // A message sent at 14:20 on the end date must still be in range, so the
    // bound is the NEXT midnight with `lt`, not that midnight with `lte`.
    const where = smsLogWhere({ to: day("2026-03-16") }) as { sentAt: { lt: Date } };
    expect(where.sentAt.lt).toEqual(day("2026-03-17"));
    expect(where.sentAt.lt.getTime()).toBeGreaterThan(
      new Date("2026-03-16T14:20:00.000Z").getTime(),
    );
  });

  it("combines both ends of a range", () => {
    expect(smsLogWhere({ from: day("2026-03-01"), to: day("2026-03-31") })).toEqual({
      sentAt: { gte: day("2026-03-01"), lt: day("2026-04-01") },
    });
  });

  it("filters by status and kind", () => {
    expect(smsLogWhere({ status: "FAILED", kind: "ABSENCE" })).toEqual({
      status: "FAILED",
      kind: "ABSENCE",
    });
  });

  it("searches the phone number, the student name and the registry number", () => {
    const where = smsLogWhere({ q: "9912" }) as { OR: unknown[] };
    expect(where.OR).toHaveLength(3);
    expect(where.OR[0]).toEqual({ phoneNumber: { contains: "9912" } });
  });

  it("ignores an all-whitespace query", () => {
    expect(smsLogWhere({ q: "   " })).toEqual({});
  });

  it("trims the query before matching", () => {
    const where = smsLogWhere({ q: "  99  " }) as { OR: { phoneNumber: { contains: string } }[] };
    expect(where.OR[0]!.phoneNumber.contains).toBe("99");
  });
});

describe("smsSenderLabel", () => {
  const labels = { automatic: (n: string) => `auto · ${n}`, unknown: "—" };

  it("names the sender of a message a person chose to send", () => {
    expect(smsSenderLabel({ kind: "BROADCAST", sentByName: "Α-ΝΙΚΟΛΑΟΥ Κ." }, labels)).toBe(
      "Α-ΝΙΚΟΛΑΟΥ Κ.",
    );
    expect(smsSenderLabel({ kind: "REFERRAL", sentByName: "Α-ΝΙΚΟΛΑΟΥ Κ." }, labels)).toBe(
      "Α-ΝΙΚΟΛΑΟΥ Κ.",
    );
  });

  it("marks an absence text as automatic rather than chosen", () => {
    expect(smsSenderLabel({ kind: "ABSENCE", sentByName: "Α-ΝΙΚΟΛΑΟΥ Κ." }, labels)).toBe(
      "auto · Α-ΝΙΚΟΛΑΟΥ Κ.",
    );
  });

  it("admits it does not know for a row written before the sender column", () => {
    expect(smsSenderLabel({ kind: "BROADCAST", sentByName: null }, labels)).toBe("—");
    expect(smsSenderLabel({ kind: "ABSENCE", sentByName: null }, labels)).toBe("—");
    expect(smsSenderLabel({ kind: null, sentByName: null }, labels)).toBe("—");
  });

  it("names a sender whose row has no recorded kind", () => {
    expect(smsSenderLabel({ kind: null, sentByName: "Α-ΝΙΚΟΛΑΟΥ Κ." }, labels)).toBe("Α-ΝΙΚΟΛΑΟΥ Κ.");
  });
});
