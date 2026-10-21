import { describe, it, expect } from "vitest";
import { normalizePhone, evaluateDefaultSms, permitContactChoices, importContactsFromRow } from "@/lib/smsContacts";

describe("normalizePhone", () => {
  it("strips spaces and punctuation", () => {
    expect(normalizePhone("99 12 34 56")).toBe("99123456");
    expect(normalizePhone("99-123-456")).toBe("99123456");
  });
  it("drops the Cyprus country code", () => {
    expect(normalizePhone("+357 99123456")).toBe("99123456");
    expect(normalizePhone("35799123456")).toBe("99123456");
  });
  it("drops leading zeros", () => {
    expect(normalizePhone("0099123456")).toBe("99123456");
  });
  it("returns empty for blank input", () => {
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone(null)).toBe("");
    expect(normalizePhone(undefined)).toBe("");
  });
  it("keeps an 8-digit number that happens to start with 357 intact", () => {
    expect(normalizePhone("35712345")).toBe("35712345");
  });
});

describe("evaluateDefaultSms", () => {
  it("flags an empty SMS number", () => {
    expect(evaluateDefaultSms("", ["99111111"])).toEqual({ flagged: true, reason: "EMPTY" });
    expect(evaluateDefaultSms(null, ["99111111"])).toEqual({ flagged: true, reason: "EMPTY" });
  });
  it("flags a number that matches no parent/guardian", () => {
    expect(evaluateDefaultSms("99999999", ["99111111", "99222222"])).toEqual({
      flagged: true,
      reason: "NO_MATCH",
    });
  });
  it("accepts a number matching a parent/guardian (format-insensitive)", () => {
    expect(evaluateDefaultSms("+357 99 111111", ["0099111111", "99222222"])).toEqual({
      flagged: false,
      reason: null,
    });
  });
  it("ignores blank parent/guardian phones when matching", () => {
    expect(evaluateDefaultSms("99111111", ["", null, "99111111"])).toEqual({
      flagged: false,
      reason: null,
    });
  });
});

describe("permitContactChoices", () => {
  const c = (id: string, name: string, phone: string, role: string, isDefault = false) =>
    ({ id, name, phone, role, isDefault });

  it("replaces an «SMS» duplicate of a parent's number with that parent, as the default", () => {
    const out = permitContactChoices([
      c("f", "ΓΕΩΡΓΙΟΥ ΑΝΔΡΕΑΣ", "99111111", "FATHER"),
      c("m", "ΓΕΩΡΓΙΟΥ ΜΑΡΙΑ", "99222222", "MOTHER"),
      c("s", "SMS", "+357 99 222222", "OTHER", true),
    ]);
    expect(out.map((x) => x.id)).toEqual(["m", "f"]);
    expect(out[0].isDefault).toBe(true);
  });

  it("keeps an «SMS» number that belongs to no parent", () => {
    const out = permitContactChoices([
      c("f", "ΓΕΩΡΓΙΟΥ ΑΝΔΡΕΑΣ", "99111111", "FATHER"),
      c("s", "SMS", "99333333", "OTHER", true),
    ]);
    expect(out.map((x) => x.id)).toEqual(["s", "f"]);
  });

  it("lists people first, then the home phone, then a non-default SMS number", () => {
    const out = permitContactChoices([
      c("s", "SMS", "99333333", "OTHER"),
      c("h", "Τηλέφωνο οικίας", "22123456", "OTHER"),
      c("m", "ΓΕΩΡΓΙΟΥ ΜΑΡΙΑ", "99222222", "MOTHER"),
    ]);
    expect(out.map((x) => x.id)).toEqual(["m", "h", "s"]);
  });

  it("offers every named parent, including the non-default (inactive) one", () => {
    const out = permitContactChoices([
      c("m", "ΓΕΩΡΓΙΟΥ ΜΑΡΙΑ", "99222222", "MOTHER", true),
      c("f", "ΓΕΩΡΓΙΟΥ ΑΝΔΡΕΑΣ", "99111111", "FATHER"),
    ]);
    expect(out.map((x) => x.id)).toEqual(["m", "f"]);
  });

  it("keeps a genuinely named OTHER contact", () => {
    expect(permitContactChoices([c("o", "ΠΑΠΠΟΥΣ", "99444444", "OTHER")]).map((x) => x.id)).toEqual(["o"]);
  });

  it("returns an empty list when there are no contacts", () => {
    expect(permitContactChoices([])).toEqual([]);
  });
});

describe("importContactsFromRow", () => {
  const row = {
    fatherName: "ΓΕΩΡΓΙΟΥ ΑΝΔΡΕΑΣ", fatherPhone: "99111111",
    motherName: "ΓΕΩΡΓΙΟΥ ΜΑΡΙΑ", motherPhone: "99222222",
    guardianName: "", homePhone: "22123456", smsPhone: "99222222",
  };

  it("yields every phone column, once per number", () => {
    expect(importContactsFromRow(row)).toEqual([
      { name: "ΓΕΩΡΓΙΟΥ ΑΝΔΡΕΑΣ", phone: "99111111", role: "FATHER" },
      { name: "ΓΕΩΡΓΙΟΥ ΜΑΡΙΑ", phone: "99222222", role: "MOTHER" },
      { name: "Τηλέφωνο οικίας", phone: "22123456", role: "OTHER" },
    ]);
  });

  it("keeps a parent's number when the file leaves the name empty", () => {
    const out = importContactsFromRow({ ...row, fatherName: "" });
    expect(out[0]).toEqual({ name: "Πατέρας", phone: "99111111", role: "FATHER" });
  });

  it("gives «Τηλέφωνο (1)» to the guardian when the row names one", () => {
    const out = importContactsFromRow({ ...row, guardianName: "ΠΑΠΑ ΝΙΚΟΣ" });
    expect(out[2]).toEqual({ name: "ΠΑΠΑ ΝΙΚΟΣ", phone: "22123456", role: "GUARDIAN" });
  });

  it("adds the SMS number only when it is nobody else's (formatting ignored)", () => {
    expect(importContactsFromRow({ ...row, smsPhone: "+357 99 222222" })).toHaveLength(3);
    expect(importContactsFromRow({ ...row, smsPhone: "99555555" }).at(-1)).toEqual(
      { name: "SMS", phone: "99555555", role: "OTHER" }
    );
  });

  it("skips empty columns", () => {
    expect(importContactsFromRow({ ...row, fatherPhone: "", homePhone: " ", smsPhone: "" })).toEqual([
      { name: "ΓΕΩΡΓΙΟΥ ΜΑΡΙΑ", phone: "99222222", role: "MOTHER" },
    ]);
  });
});
