import { describe, it, expect } from "vitest";
import el from "../../../messages/el.json";
import en from "../../../messages/en.json";

// The project rule is that every user-facing string exists in BOTH locales.
// Nothing enforced it, so a hand-edit to one file could silently leave the
// other with a missing key — which next-intl turns into a runtime error on
// the page that uses it.
function flatKeys(obj: unknown, prefix = ""): Set<string> {
  const out = new Set<string>();
  if (typeof obj !== "object" || obj === null) return out;
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      for (const nested of flatKeys(v, path)) out.add(nested);
    } else {
      out.add(path);
    }
  }
  return out;
}

describe("i18n locale parity", () => {
  const elKeys = flatKeys(el);
  const enKeys = flatKeys(en);

  it("has no key present in Greek but missing from English", () => {
    expect([...elKeys].filter((k) => !enKeys.has(k)).sort()).toEqual([]);
  });

  it("has no key present in English but missing from Greek", () => {
    expect([...enKeys].filter((k) => !elKeys.has(k)).sort()).toEqual([]);
  });

  it("does not reintroduce the removed student personal-data keys", () => {
    // Deleted 2026-08-03 for GDPR data minimisation — the underlying columns
    // no longer exist, so a label reappearing means someone is wiring the
    // fields back up.
    const removed = [
      "studentFile.fieldDateOfBirth",
      "studentFile.fieldPlaceOfBirth",
      "studentFile.fieldNationality",
      "studentFile.fieldIdCard",
      "studentFile.fieldPassport",
      "adminStudents.dateOfBirth",
      "adminStudents.placeOfBirth",
      "adminStudents.nationality",
      "adminStudents.idCard",
      "adminStudents.passport",
      "adminStudents.idCardNumber",
      "adminStudents.passportNumber",
    ];
    expect(removed.filter((k) => elKeys.has(k) || enKeys.has(k))).toEqual([]);
  });
});
