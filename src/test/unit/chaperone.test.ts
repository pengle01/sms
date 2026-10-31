import { describe, it, expect } from "vitest";
import { chaperoneNameKey, chaperoneEntriesFromRows, availableChaperoneNames } from "@/lib/chaperone";

describe("chaperone name matching", () => {
  it("ignores accents, case, spacing and word order", () => {
    expect(chaperoneNameKey("Παπάς  Γιώργος")).toBe(chaperoneNameKey("ΓΙΩΡΓΟΣ ΠΑΠΑΣ"));
    expect(chaperoneNameKey(" Μαρία Νικολάου ")).toBe("ΜΑΡΙΑ ΝΙΚΟΛΑΟΥ");
  });

  it("keeps different names apart", () => {
    expect(chaperoneNameKey("Γιώργος Παπάς")).not.toBe(chaperoneNameKey("Γιώργος Παππάς"));
    expect(chaperoneNameKey(null)).toBe("");
  });
});

describe("chaperone list upload", () => {
  it("reads a full-name chaperone column and the registry column, each pair once", () => {
    expect(
      chaperoneEntriesFromRows([
        { "Ονοματεπώνυμο Συνοδού": "Παπάς Γιώργος", "Αρ. Μητρώου": 1234 },
        { "Ονοματεπώνυμο Συνοδού": "Παπάς Γιώργος", "Αρ. Μητρώου": " 5678 " },
        { "Ονοματεπώνυμο Συνοδού": "ΠΑΠΑΣ  ΓΙΩΡΓΟΣ", "Αρ. Μητρώου": "1234" },
        { "Ονοματεπώνυμο Συνοδού": "", "Αρ. Μητρώου": "9" },
        { "Ονοματεπώνυμο Συνοδού": "", "Αρ. Μητρώου": "" },
      ]),
    ).toEqual({
      ok: true,
      entries: [
        { name: "Παπάς Γιώργος", registry: "1234" },
        { name: "Παπάς Γιώργος", registry: "5678" },
      ],
      skipped: 1,
    });
  });

  it("joins surname and name columns", () => {
    const sheet = chaperoneEntriesFromRows([{ "Επώνυμο συνοδού": "Νικολάου", "Όνομα συνοδού": "Μαρία", "ΑΡ. ΜΗΤΡΩΟΥ": "7" }]);
    expect(sheet).toEqual({ ok: true, entries: [{ name: "Νικολάου Μαρία", registry: "7" }], skipped: 0 });
    const plain = chaperoneEntriesFromRows([{ Επώνυμο: "Νικολάου", Όνομα: "Μαρία", "Αρ. Μητρώου": "7" }]);
    expect(plain).toEqual(sheet);
  });

  it("refuses an empty sheet or one missing a column", () => {
    expect(chaperoneEntriesFromRows([])).toEqual({ ok: false, error: "empty" });
    expect(chaperoneEntriesFromRows([{ Συνοδός: "Α" }])).toEqual({ ok: false, error: "noRegistryColumn" });
    expect(chaperoneEntriesFromRows([{ "Αρ. Μητρώου": "1", Τμήμα: "Α1" }])).toEqual({ ok: false, error: "noNameColumn" });
  });
});

describe("chaperone names offered at sign-up", () => {
  it("offers each listed person once, sorted, minus those with an account", () => {
    const entries = [
      { name: "Παπάς Γιώργος", nameKey: chaperoneNameKey("Παπάς Γιώργος") },
      { name: "ΠΑΠΑΣ ΓΙΩΡΓΟΣ", nameKey: chaperoneNameKey("ΠΑΠΑΣ ΓΙΩΡΓΟΣ") },
      { name: "Νικολάου Μαρία", nameKey: chaperoneNameKey("Νικολάου Μαρία") },
      { name: "Αντωνίου Ελένη", nameKey: chaperoneNameKey("Αντωνίου Ελένη") },
    ];
    expect(availableChaperoneNames(entries, new Set())).toEqual(["Αντωνίου Ελένη", "Νικολάου Μαρία", "Παπάς Γιώργος"]);
    expect(availableChaperoneNames(entries, new Set([chaperoneNameKey("Μαρία Νικολάου")]))).toEqual([
      "Αντωνίου Ελένη",
      "Παπάς Γιώργος",
    ]);
  });
});
