import { describe, it, expect } from "vitest";
import { normalizePmp, isValidPmp, validateProfileInput } from "@/lib/profile";

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

describe("validateProfileInput", () => {
  const base = { name: "Μαρία Παπαδοπούλου", phone: "", department: "", pmp: "" };

  it("normalises and accepts a complete input", () => {
    const v = validateProfileInput({
      name: "  Μαρία   Παπαδοπούλου ",
      phone: " 99123456 ",
      department: " Μαθηματικά ",
      pmp: " 12345 ",
    });
    expect(v).toEqual({
      ok: true,
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
      name: "Μαρία Παπαδοπούλου",
      phone: null,
      department: null,
      pmp: null,
    });
  });

  it("rejects a too-short name", () => {
    expect(validateProfileInput({ ...base, name: " X " })).toEqual({ ok: false, error: "errName" });
  });

  it("rejects a malformed ΠΜΠ", () => {
    expect(validateProfileInput({ ...base, pmp: "12#45" })).toEqual({ ok: false, error: "errPmp" });
  });
});
