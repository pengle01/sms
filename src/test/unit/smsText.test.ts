import { describe, it, expect } from "vitest";
import {
  isGsmEncodable,
  pickEncoding,
  smsSegmentInfo,
  toGatewayPhone,
  dedupeByPhone,
} from "@/lib/smsText";

describe("pickEncoding / isGsmEncodable", () => {
  it("uses GSM for plain Latin text", () => {
    expect(pickEncoding("Hello, parent! Meeting at 9.")).toBe("GSM");
    expect(isGsmEncodable("Hello, parent! Meeting at 9.")).toBe(true);
  });

  it("uses UCS2 for Greek text (accents/lowercase fall outside GSM)", () => {
    expect(pickEncoding("Καλημέρα, η συνάντηση είναι στις 9.")).toBe("UCS2");
    expect(isGsmEncodable("Καλημέρα")).toBe(false);
  });

  it("treats the empty string as GSM", () => {
    expect(pickEncoding("")).toBe("GSM");
  });
});

describe("smsSegmentInfo", () => {
  it("counts a short GSM message as one segment", () => {
    const info = smsSegmentInfo("Short message");
    expect(info.encoding).toBe("GSM");
    expect(info.segments).toBe(1);
    expect(info.length).toBe(13);
  });

  it("returns zero segments for an empty message", () => {
    expect(smsSegmentInfo("").segments).toBe(0);
  });

  it("splits a long GSM message at 160, then 153 per segment", () => {
    expect(smsSegmentInfo("a".repeat(160)).segments).toBe(1);
    expect(smsSegmentInfo("a".repeat(161)).segments).toBe(2); // 161 ≤ 306
    expect(smsSegmentInfo("a".repeat(306)).segments).toBe(2);
    expect(smsSegmentInfo("a".repeat(307)).segments).toBe(3);
  });

  it("splits a UCS2 message at 70, then 67 per segment", () => {
    const single = smsSegmentInfo("α".repeat(70));
    expect(single.encoding).toBe("UCS2");
    expect(single.segments).toBe(1);
    expect(smsSegmentInfo("α".repeat(71)).segments).toBe(2);
    expect(smsSegmentInfo("α".repeat(134)).segments).toBe(2);
    expect(smsSegmentInfo("α".repeat(135)).segments).toBe(3);
  });

  it("flags messages beyond 3 segments as over the limit", () => {
    expect(smsSegmentInfo("a".repeat(460)).overLimit).toBe(true);
    expect(smsSegmentInfo("a".repeat(459)).overLimit).toBe(false);
  });

  it("counts GSM extension characters as two", () => {
    // "€" is an extension char → 2 units
    expect(smsSegmentInfo("€").length).toBe(2);
  });

  it("respects a forced encoding", () => {
    const info = smsSegmentInfo("a".repeat(100), "UCS2");
    expect(info.encoding).toBe("UCS2");
    expect(info.segments).toBe(2); // 100 > 70
  });
});

describe("toGatewayPhone", () => {
  it("formats a local Cyprus mobile to 357…", () => {
    expect(toGatewayPhone("99123456")).toBe("35799123456");
  });

  it("strips +357 and reformats (the gateway rejects +357)", () => {
    expect(toGatewayPhone("+357 99 123456")).toBe("35799123456");
  });

  it("strips a 00357 prefix and leading zeros", () => {
    expect(toGatewayPhone("0035799123456")).toBe("35799123456");
  });

  it("returns empty string when there are no digits", () => {
    expect(toGatewayPhone("")).toBe("");
    expect(toGatewayPhone(null)).toBe("");
  });
});

describe("dedupeByPhone", () => {
  it("keeps the first occurrence of each distinct phone", () => {
    const out = dedupeByPhone([
      { phone: "99123456", studentName: "A" },
      { phone: "+357 99 123456", studentName: "B" }, // same number, different format
      { phone: "99999999", studentName: "C" },
    ]);
    expect(out.map((t) => t.studentName)).toEqual(["A", "C"]);
  });

  it("drops entries with no usable phone", () => {
    const out = dedupeByPhone([{ phone: "" }, { phone: "99123456" }]);
    expect(out).toHaveLength(1);
  });
});
