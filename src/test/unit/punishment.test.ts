import { describe, it, expect } from "vitest";
import { validatePunishment, SUSPENDED_MAX_DAYS } from "@/lib/punishment";
import { expulsionDayPeriods, totalPeriodsForDays, validExpulsionDay } from "@/lib/periods";
import { ACTION_ORDER, expulsionLength, lengthLabel, resolutionSummary, expulsionDayLabel } from "@/lib/referralLabels";

const config = { 1: 8, 2: 7, 3: 7, 4: 8, 5: 7 };
const TODAY = "2026-10-26"; // a Monday

describe("expulsion days with period ranges", () => {
  it("counts a whole day by its weekday and a range by its size", () => {
    expect(expulsionDayPeriods(config, "2026-10-26")).toBe(8);
    expect(expulsionDayPeriods(config, { date: "2026-10-27", fromPeriod: 3, toPeriod: 5 })).toBe(3);
    expect(expulsionDayPeriods(config, { date: "2026-10-31" })).toBe(0); // Saturday
  });

  it("adds up whole and partial days", () => {
    expect(totalPeriodsForDays(config, ["2026-10-26", { date: "2026-10-27", fromPeriod: 6, toPeriod: 7 }])).toBe(10);
  });

  it("accepts a whole day or a range inside the day", () => {
    expect(validExpulsionDay({}, 7)).toBe(true);
    expect(validExpulsionDay({ fromPeriod: 2, toPeriod: 7 }, 7)).toBe(true);
    expect(validExpulsionDay({ fromPeriod: 5, toPeriod: 3 }, 7)).toBe(false);
    expect(validExpulsionDay({ fromPeriod: 1, toPeriod: 8 }, 7)).toBe(false);
    expect(validExpulsionDay({ fromPeriod: 2 }, 7)).toBe(false);
  });
});

describe("validatePunishment", () => {
  it("needs dated school days, today or later, for an expulsion", () => {
    expect(validatePunishment({ action: "DETENTION", expulsionDays: [] }, config, TODAY)).toBe("noDays");
    expect(validatePunishment({ action: "DETENTION", expulsionDays: [{ date: "2026-10-23" }] }, config, TODAY)).toBe("pastDay");
    expect(validatePunishment({ action: "DETENTION", expulsionDays: [{ date: "2026-10-31" }] }, config, TODAY)).toBe("weekend");
    expect(validatePunishment({ action: "DETENTION", expulsionDays: [{ date: TODAY }, { date: TODAY }] }, config, TODAY)).toBe("duplicateDay");
    expect(
      validatePunishment({ action: "DETENTION", expulsionDays: [{ date: "2026-10-27", fromPeriod: 3, toPeriod: 9 }] }, config, TODAY),
    ).toBe("badRange");
    expect(
      validatePunishment(
        { action: "DETENTION", expulsionDays: [{ date: TODAY }, { date: "2026-10-27", fromPeriod: 3, toPeriod: 5 }] },
        config,
        TODAY,
      ),
    ).toBeNull();
  });

  it("needs a length, not dates, for a suspended expulsion", () => {
    expect(validatePunishment({ action: "SUSPENDED_EXPULSION" }, config, TODAY)).toBe("noSuspendedLength");
    expect(validatePunishment({ action: "SUSPENDED_EXPULSION", suspendedDays: 2 }, config, TODAY)).toBeNull();
    expect(validatePunishment({ action: "SUSPENDED_EXPULSION", suspendedPeriods: 3 }, config, TODAY)).toBeNull();
    expect(validatePunishment({ action: "SUSPENDED_EXPULSION", suspendedDays: SUSPENDED_MAX_DAYS + 1 }, config, TODAY)).toBe("badSuspended");
    expect(validatePunishment({ action: "SUSPENDED_EXPULSION", suspendedDays: -1 }, config, TODAY)).toBe("badSuspended");
  });

  it("asks nothing of the other measures", () => {
    expect(validatePunishment({ action: "WARNING" }, config, TODAY)).toBeNull();
  });
});

describe("labels and summaries", () => {
  it("offers Προειδοποίηση before Γραπτή Συμφωνία, and the suspended expulsion before Αποβολή", () => {
    expect(ACTION_ORDER.indexOf("WARNING")).toBeLessThan(ACTION_ORDER.indexOf("WRITTEN_AGREEMENT"));
    expect(ACTION_ORDER.indexOf("SUSPENDED_EXPULSION")).toBeLessThan(ACTION_ORDER.indexOf("DETENTION"));
  });

  it("counts whole days as days and ranges as periods", () => {
    expect(expulsionLength([{}, { fromPeriod: 3, toPeriod: 5 }])).toEqual({ days: 1, periods: 3 });
    expect(lengthLabel(1, 3)).toBe("1 ημέρα + 3 περίοδοι");
    expect(lengthLabel(0, 1)).toBe("1 περίοδος");
  });

  it("summarises each kind of length", () => {
    const d = (fromPeriod: number | null = null, toPeriod: number | null = null) => ({ date: new Date("2026-10-26"), fromPeriod, toPeriod });
    expect(resolutionSummary({ action: "DETENTION", expulsionDays: [d(), d()] })).toBe("Αποβολή · 2 ημέρες");
    expect(resolutionSummary({ action: "DETENTION", expulsionDays: [d(), d(3, 5)] })).toBe("Αποβολή · 1 ημέρα + 3 περίοδοι");
    expect(resolutionSummary({ action: "DETENTION", expulsionDays: [d(3, 5)] })).toBe("Αποβολή · 3 περίοδοι");
    expect(resolutionSummary({ action: "SUSPENDED_EXPULSION", suspendedDays: 2 })).toBe("Αποβολή με Αναστολή · 2 ημέρες");
    expect(resolutionSummary({ action: "SUSPENDED_EXPULSION", suspendedPeriods: 4 })).toBe("Αποβολή με Αναστολή · 4 περίοδοι");
  });

  it("labels a partial day with its periods", () => {
    const fmt = () => "26/10/26";
    expect(expulsionDayLabel({ date: new Date(), fromPeriod: 3, toPeriod: 5 }, fmt)).toBe("26/10/26 · Π3–Π5");
    expect(expulsionDayLabel({ date: new Date() }, fmt)).toBe("26/10/26");
  });
});
