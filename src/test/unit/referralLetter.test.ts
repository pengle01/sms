import { describe, it, expect } from "vitest";
import { measureSummary, expulsionWhere, letterOffence, parentLines, letterDate } from "@/lib/referralLetter";

describe("measureSummary", () => {
  it("counts expulsion days", () => {
    expect(measureSummary("DETENTION", 1, "x")).toBe("1 μέρα αποβολή");
    expect(measureSummary("DETENTION", 3, null)).toBe("3 μέρες αποβολή");
  });

  it("uses the label and details for other measures", () => {
    expect(measureSummary("WARNING", 0, "  Γραπτή προειδοποίηση ")).toBe("Προειδοποίηση: Γραπτή προειδοποίηση");
    expect(measureSummary("PEDAGOGICAL_DIALOGUE", 0, "")).toBe("Παιδαγωγικός Διάλογος");
  });
});

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
