import { describe, it, expect } from "vitest";
import {
  DEFAULT_ABSENCE_SMS,
  isPastCutoff,
  isValidCutoff,
  parseAbsenceSms,
  renderAbsenceSms,
  shouldSendAbsenceSms,
} from "@/lib/absenceSms";

/** A Date at a given local wall-clock time; the rule compares local hours. */
const at = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  const d = new Date(2025, 8, 8); // 8 Sep 2025, local
  d.setHours(h, m, 0, 0);
  return d;
};

describe("isValidCutoff", () => {
  it("accepts a padded 24-hour time", () => {
    expect(isValidCutoff("09:30")).toBe(true);
    expect(isValidCutoff("00:00")).toBe(true);
    expect(isValidCutoff("23:59")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidCutoff("9:30")).toBe(false); // unpadded
    expect(isValidCutoff("24:00")).toBe(false);
    expect(isValidCutoff("09:60")).toBe(false);
    expect(isValidCutoff("0930")).toBe(false);
    expect(isValidCutoff("")).toBe(false);
  });
});

describe("parseAbsenceSms", () => {
  it("falls back to the default for empty or malformed input", () => {
    expect(parseAbsenceSms(null)).toEqual(DEFAULT_ABSENCE_SMS);
    expect(parseAbsenceSms("")).toEqual(DEFAULT_ABSENCE_SMS);
    expect(parseAbsenceSms("{not json")).toEqual(DEFAULT_ABSENCE_SMS);
    expect(parseAbsenceSms("[]")).toEqual(DEFAULT_ABSENCE_SMS);
  });

  it("reads a well-formed value", () => {
    expect(parseAbsenceSms('{"enabled":true,"cutoff":"08:45","template":"Χ {όνομα}"}')).toEqual({
      enabled: true,
      cutoff: "08:45",
      template: "Χ {όνομα}",
    });
  });

  it("coerces enabled strictly, so a truthy string does not switch it on", () => {
    expect(parseAbsenceSms('{"enabled":"yes"}').enabled).toBe(false);
    expect(parseAbsenceSms('{"enabled":1}').enabled).toBe(false);
  });

  it("replaces an invalid cutoff or an empty template with the default", () => {
    expect(parseAbsenceSms('{"cutoff":"25:00"}').cutoff).toBe(DEFAULT_ABSENCE_SMS.cutoff);
    expect(parseAbsenceSms('{"template":"   "}').template).toBe(DEFAULT_ABSENCE_SMS.template);
  });

  it("trims and caps an over-long template", () => {
    const long = "α".repeat(400);
    expect(parseAbsenceSms(JSON.stringify({ template: long })).template).toHaveLength(300);
  });
});

describe("isPastCutoff", () => {
  it("is false before the cutoff", () => {
    expect(isPastCutoff(at("08:00"), "09:30")).toBe(false);
    expect(isPastCutoff(at("09:29"), "09:30")).toBe(false);
  });

  it("is false AT the cutoff — the boundary is inclusive", () => {
    // A register saved exactly on the deadline should still notify; losing it
    // to a race with the clock would be arbitrary.
    expect(isPastCutoff(at("09:30"), "09:30")).toBe(false);
  });

  it("is true after the cutoff", () => {
    expect(isPastCutoff(at("09:31"), "09:30")).toBe(true);
    expect(isPastCutoff(at("23:59"), "09:30")).toBe(true);
  });

  it("treats a broken cutoff as no cutoff rather than silencing the feature", () => {
    expect(isPastCutoff(at("23:59"), "nonsense")).toBe(false);
  });
});

describe("renderAbsenceSms", () => {
  const v = { name: "ΑΝΔΡΕΟΥ ΜΑΡΙΑ", date: "08/09/25" };

  it("fills the Greek placeholders", () => {
    expect(renderAbsenceSms("Απουσία: {όνομα} {ημερομηνία}", v)).toBe(
      "Απουσία: ΑΝΔΡΕΟΥ ΜΑΡΙΑ 08/09/25",
    );
  });

  it("accepts the English spellings too", () => {
    expect(renderAbsenceSms("Absent: {name} {date}", v)).toBe("Absent: ΑΝΔΡΕΟΥ ΜΑΡΙΑ 08/09/25");
  });

  it("accepts unaccented Greek, which is how it is often typed", () => {
    expect(renderAbsenceSms("{ονομα} {ημερομηνια}", v)).toBe("ΑΝΔΡΕΟΥ ΜΑΡΙΑ 08/09/25");
  });

  it("fills every occurrence", () => {
    expect(renderAbsenceSms("{όνομα}/{όνομα}", v)).toBe("ΑΝΔΡΕΟΥ ΜΑΡΙΑ/ΑΝΔΡΕΟΥ ΜΑΡΙΑ");
  });

  it("leaves a template with no placeholders alone", () => {
    expect(renderAbsenceSms("Απουσία σήμερα.", v)).toBe("Απουσία σήμερα.");
  });
});

describe("shouldSendAbsenceSms", () => {
  const base = {
    config: { enabled: true, cutoff: "09:30", template: "x" },
    attendanceDateIso: "2025-09-08",
    todayIso: "2025-09-08",
    now: at("08:15"),
    status: "ABSENT",
    alreadySent: false,
  };

  it("sends for a fresh absence, today, before the cutoff", () => {
    expect(shouldSendAbsenceSms(base)).toBe(true);
  });

  it("does not send when the feature is off", () => {
    expect(shouldSendAbsenceSms({ ...base, config: { ...base.config, enabled: false } })).toBe(false);
  });

  it("does not send for a back-dated register", () => {
    // Catching up on Monday's absences on Wednesday must not tell parents the
    // child is absent today.
    expect(shouldSendAbsenceSms({ ...base, attendanceDateIso: "2025-09-05" })).toBe(false);
  });

  it("does not send after the cutoff", () => {
    expect(shouldSendAbsenceSms({ ...base, now: at("10:00") })).toBe(false);
  });

  it("does not send for a status other than ABSENT", () => {
    expect(shouldSendAbsenceSms({ ...base, status: "LATE" })).toBe(false);
    expect(shouldSendAbsenceSms({ ...base, status: "PRESENT" })).toBe(false);
  });

  it("does not send twice for the same row", () => {
    expect(shouldSendAbsenceSms({ ...base, alreadySent: true })).toBe(false);
  });
});
