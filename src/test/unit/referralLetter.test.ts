import { describe, it, expect } from "vitest";
import { expulsionWhere, letterOffence, parentLines, letterDate, letterExpulsionDay, letterPunishment } from "@/lib/referralLetter";

describe("expulsionWhere", () => {
  it("is home for 2+ days, school for 1, nothing otherwise", () => {
    expect(expulsionWhere(0)).toBeNull();
    expect(expulsionWhere(1)).toBe("Σχολείο");
    expect(expulsionWhere(2)).toBe("Σπίτι");
    expect(expulsionWhere(5)).toBe("Σπίτι");
  });
});

describe("letterOffence", () => {
  it("prefers the title, else the description", () => {
    expect(letterOffence("Χρήση κινητού τηλεφώνου", "Κατά τη διάρκεια…")).toBe("Χρήση κινητού τηλεφώνου");
    expect(letterOffence(null, " Κατά τη διάρκεια… ")).toBe("Κατά τη διάρκεια…");
    expect(letterOffence("  ", "Περιγραφή")).toBe("Περιγραφή");
  });
});

describe("parentLines", () => {
  it("orders father, mother, guardian and drops others and repeats", () => {
    expect(
      parentLines([
        { role: "MOTHER", name: "ΜΑΡΙΑ", phone: "99111111" },
        { role: "OTHER", name: "SMS", phone: "99000000" },
        { role: "FATHER", name: "ΓΙΩΡΓΟΣ", phone: "99222222" },
        { role: "FATHER", name: "ΓΙΩΡΓΟΣ", phone: "99222222" },
        { role: "GUARDIAN", name: "ΘΕΙΑ", phone: null },
      ]),
    ).toEqual(["Πατέρας: ΓΙΩΡΓΟΣ — 99222222", "Μητέρα: ΜΑΡΙΑ — 99111111", "Κηδεμόνας: ΘΕΙΑ"]);
  });
});

describe("letterDate", () => {
  it("formats the Cyprus date with a short Greek weekday", () => {
    expect(letterDate(new Date("2026-10-19T09:00:00.000Z"))).toBe("Δευ, 19/10/2026");
    // 23:30 UTC on Sunday is already Monday in Cyprus
    expect(letterDate(new Date("2026-10-18T22:30:00.000Z"))).toBe("Δευ, 19/10/2026");
  });
});

describe("letterPunishment", () => {
  const day = (iso: string, fromPeriod: number | null = null, toPeriod: number | null = null) => ({
    date: new Date(`${iso}T00:00:00.000Z`),
    fromPeriod,
    toPeriod,
  });

  it("labels a whole day and a period range", () => {
    expect(letterExpulsionDay(day("2026-10-27"))).toEqual({ date: "Τρι, 27/10/2026", span: "Όλη η μέρα" });
    expect(letterExpulsionDay(day("2026-10-28", 3, 5))).toEqual({ date: "Τετ, 28/10/2026", span: "Περίοδοι 3–5" });
  });

  it("lists an expulsion's days in order with its length and where it is served", () => {
    const m = letterPunishment({
      action: "DETENTION",
      actionDetails: " Χρήση κινητού ",
      expulsionDays: [day("2026-10-28", 3, 5), day("2026-10-27")],
    });
    expect(m.measure).toBe("Αποβολή");
    expect(m.length).toBe("1 ημέρα + 3 περίοδοι");
    expect(m.days.map((d) => d.date)).toEqual(["Τρι, 27/10/2026", "Τετ, 28/10/2026"]);
    expect(m.where).toBe("Σχολείο");
    expect(m.details).toBe("Χρήση κινητού");
    expect(m.note).toBeNull();
  });

  it("serves two or more whole days at home, periods only at school", () => {
    expect(letterPunishment({ action: "DETENTION", expulsionDays: [day("2026-10-27"), day("2026-10-28")] }).where).toBe("Σπίτι");
    expect(letterPunishment({ action: "DETENTION", expulsionDays: [day("2026-10-27", 1, 2)] }).where).toBe("Σχολείο");
  });

  it("gives a suspended expulsion its length and a note, without days", () => {
    const m = letterPunishment({ action: "SUSPENDED_EXPULSION", suspendedDays: 2, suspendedPeriods: null, expulsionDays: [] });
    expect(m.measure).toBe("Αποβολή με Αναστολή");
    expect(m.length).toBe("2 ημέρες");
    expect(m.days).toEqual([]);
    expect(m.where).toBeNull();
    expect(m.note).toMatch(/νέου παραπτώματος/);
  });

  it("shows any other measure with its description only", () => {
    expect(letterPunishment({ action: "WARNING", actionDetails: "", expulsionDays: [] })).toEqual({
      measure: "Προειδοποίηση", length: null, days: [], where: null, note: null, details: null,
    });
  });
});
