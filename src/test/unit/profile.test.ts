import { describe, it, expect } from "vitest";
import {
  normalizePmp,
  isValidPmp,
  validateProfileInput,
  composeFullName,
  splitFullName,
  profileIncomplete,
} from "@/lib/profile";

describe("normalizePmp", () => {
  it("trims and strips inner whitespace", () => {
    expect(normalizePmp(" 12 345 ")).toBe("12345");
  });

  it("returns null for empty or missing values", () => {
    expect(normalizePmp("")).toBe(null);
    expect(normalizePmp("   ")).toBe(null);
    expect(normalizePmp(null)).toBe(null);
    expect(normalizePmp(undefined)).toBe(null);
  });
});

describe("isValidPmp", () => {
  it("accepts digits and letters up to 20 chars", () => {
    expect(isValidPmp("12345")).toBe(true);
    expect(isValidPmp("A12345")).toBe(true);
    expect(isValidPmp("Π12345")).toBe(true);
  });

  it("rejects symbols and over-long values", () => {
    expect(isValidPmp("12-345")).toBe(false);
    expect(isValidPmp("1".repeat(21))).toBe(false);
  });
});

describe("composeFullName", () => {
  it("joins first + surname and collapses whitespace", () => {
    expect(composeFullName("  Μαρία ", " Παπαδοπούλου ")).toBe("Μαρία Παπαδοπούλου");
  });

  it("omits an empty part without a stray space", () => {
    expect(composeFullName("Μαρία", "")).toBe("Μαρία");
    expect(composeFullName("", "Παπαδοπούλου")).toBe("Παπαδοπούλου");
  });
});

describe("splitFullName", () => {
  it("splits on the first space: first token vs the rest", () => {
    expect(splitFullName("Μαρία Παπαδοπούλου")).toEqual({ firstName: "Μαρία", lastName: "Παπαδοπούλου" });
    expect(splitFullName("Μαρία Ελένη Παπαδοπούλου")).toEqual({
      firstName: "Μαρία",
      lastName: "Ελένη Παπαδοπούλου",
    });
  });

  it("handles a single token and empty/nullish input", () => {
    expect(splitFullName("Μαρία")).toEqual({ firstName: "Μαρία", lastName: "" });
    expect(splitFullName("")).toEqual({ firstName: "", lastName: "" });
    expect(splitFullName(null)).toEqual({ firstName: "", lastName: "" });
    expect(splitFullName(undefined)).toEqual({ firstName: "", lastName: "" });
  });
});

describe("validateProfileInput", () => {
  const base = { firstName: "Μαρία", lastName: "Παπαδοπούλου", phone: "", department: "", pmp: "" };

  it("normalises and accepts a complete input", () => {
    const v = validateProfileInput({
      firstName: "  Μαρία ",
      lastName: " Παπαδοπούλου ",
      phone: " 99123456 ",
      department: " Μαθηματικά ",
      pmp: " 12345 ",
    });
    expect(v).toEqual({
      ok: true,
      firstName: "Μαρία",
      lastName: "Παπαδοπούλου",
      name: "Μαρία Παπαδοπούλου",
      phone: "99123456",
      department: "Μαθηματικά",
      pmp: "12345",
    });
  });

  it("turns empty optional fields into null", () => {
    const v = validateProfileInput(base);
    expect(v).toEqual({
      ok: true,
      firstName: "Μαρία",
      lastName: "Παπαδοπούλου",
      name: "Μαρία Παπαδοπούλου",
      phone: null,
      department: null,
      pmp: null,
    });
  });

  it("rejects a too-short first name", () => {
    expect(validateProfileInput({ ...base, firstName: " X " })).toEqual({ ok: false, error: "errFirstName" });
  });

  it("rejects a missing surname", () => {
    expect(validateProfileInput({ ...base, lastName: " " })).toEqual({ ok: false, error: "errLastName" });
  });

  it("rejects a malformed ΠΜΠ", () => {
    expect(validateProfileInput({ ...base, pmp: "12#45" })).toEqual({ ok: false, error: "errPmp" });
  });

  it("keeps phone/department/ΠΜΠ optional when not requiring staff fields", () => {
    expect(validateProfileInput(base)).toMatchObject({ ok: true, phone: null, department: null, pmp: null });
  });

  describe("with requireStaffFields = true", () => {
    const full = { firstName: "Μαρία", lastName: "Παπαδοπούλου", phone: "99123456", department: "Μαθηματικά", pmp: "12345" };

    it("accepts a fully completed profile", () => {
      expect(validateProfileInput(full, true)).toMatchObject({ ok: true, phone: "99123456", department: "Μαθηματικά", pmp: "12345" });
    });

    it("rejects an empty phone", () => {
      expect(validateProfileInput({ ...full, phone: "  " }, true)).toEqual({ ok: false, error: "errPhone" });
    });

    it("rejects an empty department", () => {
      expect(validateProfileInput({ ...full, department: "" }, true)).toEqual({ ok: false, error: "errDepartment" });
    });

    it("rejects a missing ΠΜΠ", () => {
      expect(validateProfileInput({ ...full, pmp: "  " }, true)).toEqual({ ok: false, error: "errPmpRequired" });
    });

    it("still rejects a malformed ΠΜΠ before the required check", () => {
      expect(validateProfileInput({ ...full, pmp: "12#45" }, true)).toEqual({ ok: false, error: "errPmp" });
    });
  });
});

describe("profileIncomplete", () => {
  const full = { pmp: "12345", phone: "99123456", department: "Πληροφορικής/Επιστήμης Η.Υ.", firstName: "Χάρης", lastName: "Πικρίδης" };

  it("is false when every field is filled", () => {
    expect(profileIncomplete(full)).toBe(false);
  });

  it("is true when any single field is missing", () => {
    for (const key of Object.keys(full) as (keyof typeof full)[]) {
      expect(profileIncomplete({ ...full, [key]: null })).toBe(true);
      expect(profileIncomplete({ ...full, [key]: "" })).toBe(true);
    }
  });
});
