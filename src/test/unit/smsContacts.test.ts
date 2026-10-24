import { describe, it, expect } from "vitest";
import {
  normalizePhone,
  evaluateDefaultSms,
  permitContactChoices,
  importContactsFromRow,
  splitPhones,
  preferredPhone,
  permitPhoneChoices,
  parentAccountPhones,
  planContactImport,
  parentCard,
} from "@/lib/smsContacts";
import { permitAccountNote } from "@/lib/exitPermit";

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

describe("splitPhones", () => {
  it("keeps a single number as typed", () => {
    expect(splitPhones("99123456")).toEqual(["99123456"]);
    expect(splitPhones(" +357 99 123456 ")).toEqual(["+357 99 123456"]);
  });

  it("splits several numbers in one field", () => {
    expect(splitPhones("99123456 / 22445566")).toEqual(["99123456", "22445566"]);
    expect(splitPhones("99123456, 22445566; 96111222")).toEqual(["99123456", "22445566", "96111222"]);
    expect(splitPhones("99123456 - 22445566")).toEqual(["99123456", "22445566"]);
    expect(splitPhones("99123456 22445566")).toEqual(["99123456", "22445566"]);
  });

  it("does not cut a number written with inner spaces", () => {
    expect(splitPhones("99 12 34 56")).toEqual(["99 12 34 56"]);
  });

  it("drops empty pieces and repeats of the same number", () => {
    expect(splitPhones("99123456 / +357 99123456 / ")).toEqual(["99123456"]);
    expect(splitPhones("")).toEqual([]);
    expect(splitPhones(null)).toEqual([]);
  });
});

describe("preferredPhone", () => {
  it("finds the SMS number among a row's numbers, however formatted", () => {
    expect(preferredPhone(["22445566", "99 123456"], "+35799123456")).toBe("99 123456");
  });

  it("is null without an SMS number or when it is not on the row", () => {
    expect(preferredPhone(["99123456"], null)).toBeNull();
    expect(preferredPhone(["99123456"], "96000000")).toBeNull();
  });
});

describe("permitContactChoices — the SMS number", () => {
  const c = (id: string, name: string, phone: string, role: string, isDefault = false) => ({ id, name, phone, role, isDefault });

  it("keeps the SMS number on the parent it is folded into", () => {
    const out = permitContactChoices([c("f", "Πατέρας", "99 123456", "FATHER"), c("s", "SMS", "+357 99123456", "OTHER", true)]);
    expect(out).toEqual([{ ...c("f", "Πατέρας", "99 123456", "FATHER", true), smsPhone: "+357 99123456" }]);
  });

  it("folds into a parent whose field holds the SMS number among others", () => {
    const out = permitContactChoices([c("m", "Μητέρα", "22445566 / 99123456", "MOTHER"), c("s", "SMS", "99123456", "OTHER", true)]);
    expect(out[0]).toMatchObject({ id: "m", isDefault: true, smsPhone: "99123456" });
    expect(out).toHaveLength(1);
  });

  it("an SMS number matching nobody is its own row, preferred with its own number", () => {
    const out = permitContactChoices([c("f", "Πατέρας", "99123456", "FATHER"), c("s", "SMS", "96000000", "OTHER", true)]);
    expect(out[0]).toMatchObject({ id: "s", isDefault: true, smsPhone: "96000000" });
  });
});

describe("permitPhoneChoices — linked parent accounts", () => {
  const c = (id: string, name: string, phone: string, role: string, isDefault = false) => ({ id, name, phone, role, isDefault });
  const contacts = [
    c("f", "Γιώργος", "99123456", "FATHER", true),
    c("h", "Τηλέφωνο οικίας", "22445566", "OTHER"),
  ];

  it("adds an account's new phone after the people, before the home number", () => {
    const out = permitPhoneChoices(contacts, [{ id: "p1", name: "Μαρία", phone: "96555444", role: "MOTHER" }]);
    expect(out.map((x) => x.value)).toEqual(["f", "account:p1", "h"]);
    expect(out[1]).toMatchObject({ kind: "account", name: "Μαρία", phone: "96555444", isDefault: false });
  });

  it("does not repeat a number already listed, however formatted, or add an account without a phone", () => {
    const out = permitPhoneChoices(contacts, [
      { id: "p1", name: "Γιώργος", phone: "+357 99 123456", role: "FATHER" },
      { id: "p2", name: "Χωρίς", phone: null, role: "MOTHER" },
    ]);
    expect(out.map((x) => x.value)).toEqual(["f", "h"]);
  });

  it("keeps the imported choices in their order and as contacts", () => {
    const out = permitPhoneChoices(contacts, []);
    expect(out.map((x) => [x.value, x.kind])).toEqual([["f", "contact"], ["h", "contact"]]);
  });

  it("names a nameless account after its role", () => {
    expect(
      parentAccountPhones([{ parentProfile: { id: "p", phone: "96", role: "MOTHER", user: { name: " " } } }])[0]!.name,
    ).toBe("Μητέρα");
  });

  it("records an account reached by phone as «Όνομα (ρόλος) · τηλέφωνο»", () => {
    expect(permitAccountNote({ name: "Μαρία ", role: "MOTHER", phone: "96555444" })).toBe("Μαρία (Μητέρα) · 96555444");
  });
});

describe("planContactImport — the file wins", () => {
  const stored = (id: string, name: string, phone: string, role: string) => ({ id, name, phone, role });
  const file = (name: string, phone: string, role: "FATHER" | "MOTHER" | "GUARDIAN" | "OTHER") => ({ name, phone, role });

  it("turns a parent once saved as «SMS» into the father, with his name", () => {
    const plan = planContactImport([stored("s", "SMS", "99123456", "OTHER")], [file("Παπαδόπουλος Γιώργος", "+357 99 123456", "FATHER")]);
    expect(plan).toEqual({ create: [], update: [{ id: "s", name: "Παπαδόπουλος Γιώργος", role: "FATHER" }] });
  });

  it("gives a bare «Πατέρας» the file's full name", () => {
    const plan = planContactImport([stored("f", "Πατέρας", "99123456", "FATHER")], [file("Παπαδόπουλος Γιώργος", "99123456", "FATHER")]);
    expect(plan.update).toEqual([{ id: "f", name: "Παπαδόπουλος Γιώργος", role: "FATHER" }]);
  });

  it("keeps a real name when the file leaves the name empty", () => {
    const plan = planContactImport([stored("f", "Παπαδόπουλος Γιώργος", "99123456", "FATHER")], [file("Πατέρας", "99123456", "FATHER")]);
    expect(plan).toEqual({ create: [], update: [] });
  });

  it("changes nothing when name and role already match, and creates a new number", () => {
    const plan = planContactImport(
      [stored("m", "Μαρία Κ.", "96555444", "MOTHER")],
      [file("Μαρία Κ.", "96555444", "MOTHER"), file("Γιώργος Κ.", "99123456", "FATHER")],
    );
    expect(plan).toEqual({ create: [file("Γιώργος Κ.", "99123456", "FATHER")], update: [] });
  });

  it("never lets the SMS placeholder overwrite a stored person", () => {
    const plan = planContactImport([stored("f", "Γιώργος", "99123456", "FATHER")], [file("SMS", "99123456", "OTHER")]);
    expect(plan).toEqual({ create: [], update: [] });
  });

  it("matches a number inside a stored two-number field", () => {
    const plan = planContactImport([stored("x", "SMS", "22445566 / 99123456", "OTHER")], [file("Γιώργος", "99123456", "FATHER")]);
    expect(plan.update).toEqual([{ id: "x", name: "Γιώργος", role: "FATHER" }]);
  });

  it("is empty for an empty file row", () => {
    expect(planContactImport([stored("f", "Γιώργος", "99", "FATHER")], [])).toEqual({ create: [], update: [] });
  });
});

describe("parentCard — people first, the SMS number only as preferred", () => {
  const c = (id: string, name: string, phone: string, role: string, isDefault = false) => ({ id, name, phone, role, isDefault });

  it("lists parents with name and role, the SMS number marking the preferred phone", () => {
    const card = parentCard([
      c("m", "Μαρία Κ.", "96555444", "MOTHER"),
      c("f", "Γιώργος Κ.", "99123456", "FATHER"),
      c("s", "SMS", "+357 96 555444", "OTHER", true),
    ]);
    expect(card.parents).toEqual([
      { id: "f", name: "Γιώργος Κ.", role: "FATHER", phones: [{ phone: "99123456", preferred: false }] },
      { id: "m", name: "Μαρία Κ.", role: "MOTHER", phones: [{ phone: "96555444", preferred: true }] },
    ]);
    expect(card.unmatchedSms).toBeNull();
  });

  it("never shows the SMS number as a person; one matching nobody is reported apart", () => {
    const card = parentCard([c("f", "Γιώργος", "99123456", "FATHER"), c("s", "SMS", "97000000", "OTHER", true)]);
    expect(card.parents.map((p) => p.id)).toEqual(["f"]);
    expect(card.unmatchedSms).toBe("97000000");
  });

  it("puts the household number apart, preferred when it is the SMS number", () => {
    const card = parentCard([c("h", "Τηλέφωνο οικίας", "22445566", "OTHER"), c("s", "SMS", "22445566", "OTHER", true)]);
    expect(card.parents).toEqual([]);
    expect(card.homePhones).toEqual([{ phone: "22445566", preferred: true }]);
  });
});
