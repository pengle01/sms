import { describe, it, expect } from "vitest";
import {
  buildVisitRows,
  foldName,
  homegroupListGroupIds,
  matchVisitEntries,
  parseStaffCode,
  parseVisitSchedule,
  parseVisitSlot,
  type VisitEntry,
} from "@/lib/visitHours";

const HEADER = ["ΟΝΟΜΑΤΕΠΩΝΥΜΟ", "ΕΙΔΙΚΟΤΗΤΑ", "ΗΜΕΡΑ -", "ΠΕΡ. -", "ΩΡΑ", "ΤΗΛΕΦΩΝΟ"];

describe("parseVisitSlot", () => {
  it("reads day, period and times, with accents or not", () => {
    expect(parseVisitSlot("ΤΡΙΤΗ 3η 9:30 - 10:15")).toEqual({
      dayOfWeek: 2, period: 3, startTime: "9:30", endTime: "10:15", byAppointment: false,
    });
    expect(parseVisitSlot("Παρασκευή 2η 08:25-09:10")?.dayOfWeek).toBe(5);
  });

  it("reads an appointment, and refuses what it can't read", () => {
    expect(parseVisitSlot("ΜΕ ΡΑΝΤΕΒΟΥ")?.byAppointment).toBe(true);
    expect(parseVisitSlot("κάποτε")).toBeNull();
    expect(parseVisitSlot("ΣΑΒΒΑΤΟ 1η 8:00 - 9:00")).toBeNull();
  });
});

describe("parseVisitSchedule", () => {
  const rows = [
    ["ΤΙΤΛΟΣ"],
    HEADER,
    ["ΔΟΚΙΜΟΣ Διευθυντής", "Διευθυντής", "ΜΕ ΡΑΝΤΕΒΟΥ", "", "", 22000001],
    ["ΠΡΩΤΟΣ ΑΝΤΡΕΑΣ", "ΒΔΑ Φυσικής", "ΔΕΥΤΕΡΑ 2η 8:20 - 9:00", "", "", 22000002],
    ["ΔΕΥΤΕΡΟΣ ΜΑΡΙΑ", "ΒΔ Μαθηματικών", "ΤΡΙΤΗ 3η 9:30 - 10:15", "", "", 22000003],
    ["", "", "", "", "", ""],
    ["ΜΑΘΗΜΑΤΙΚΑ ΤΗΛ: 22000009", "", "", "", "", ""],
    ["ΤΡΙΤΟΣ", "ΓΙΩΡΓΟΣ", "ΠΕΜΠΤΗ 5η 10:50 - 11:30", "", "", ""],
    ["ΔΙΠΛΟΣ", "ΝΙΚΟΣ", "ΠΕΜΠΤΗ 4η 9:55 - 10:35", "", "", ""],
    ["ΔΙΠΛΟΣ", "ΝΙΚΟΣ", "ΠΕΜΠΤΗ 4η 9:55 - 10:35", "", "", ""],
    ["ΛΑΘΟΣ", "ΩΡΑ", "κάποτε", "", "", ""],
    ["ΑΠΌ  ΤΗ  ΔΙΕΥΘΥΝΣΗ", "", 46318, "", "", ""],
    [46328, "", "", "", "", ""],
  ];
  const { entries, unreadable } = parseVisitSchedule(rows);

  it("reads both layouts under their headings and stops at the footer", () => {
    expect(entries.map((e) => e.fileName)).toEqual([
      "ΔΟΚΙΜΟΣ Διευθυντής", "ΠΡΩΤΟΣ ΑΝΤΡΕΑΣ", "ΔΕΥΤΕΡΟΣ ΜΑΡΙΑ", "ΤΡΙΤΟΣ ΓΙΩΡΓΟΣ", "ΔΙΠΛΟΣ ΝΙΚΟΣ",
    ]);
    expect(entries[3]!.section).toBe("ΜΑΘΗΜΑΤΙΚΑ");
    expect(entries[3]!.surname).toBe("ΤΡΙΤΟΣ");
  });

  it("keeps a phone only for headteachers", () => {
    expect(entries.map((e) => e.phone)).toEqual([null, "22000002", "22000003", null, null]);
  });

  it("reports an unreadable slot", () => {
    expect(unreadable).toEqual(["ΛΑΘΟΣ ΩΡΑ: κάποτε"]);
  });

  it("returns nothing without the header row", () => {
    expect(parseVisitSchedule([["κάτι άλλο"]]).entries).toEqual([]);
  });
});

describe("names", () => {
  it("folds accents, Latin look-alikes and doubled letters", () => {
    expect(foldName("Κουννούσιης")).toBe(foldName("ΚΟΥΝΟΥΣΙΗΣ"));
    expect(foldName("A.")).toBe("Α.");
  });

  it("reads a coding, ignoring a management suffix", () => {
    expect(parseStaffCode("Μ-ΚΑΣΤΡΟΣ ΜΑΡ.")).toEqual({ subject: "Μ", surname: "ΚΑΣΤΡΟΣ", initial: "ΜΑΡ" });
    expect(parseStaffCode("ΗΥ-ΚΑΣΤΡΟΣ ΒΔ")?.initial).toBe("");
    expect(parseStaffCode("ΚΑΣΤΡΟΣ")).toBeNull();
  });
});

describe("matchVisitEntries", () => {
  const entry = (name: string, section = "", key = name): VisitEntry => {
    const [surname = "", ...rest] = name.split(" ");
    return {
      key, fileName: name, surname, firstName: rest.join(" "), section, slotText: "", dayOfWeek: 1, period: 1,
      startTime: null, endTime: null, byAppointment: false, phone: null,
    };
  };
  const staff = [
    { id: "a", scheduleName: "Μ-ΑΛΦΑΣ Σ." },
    { id: "b1", scheduleName: "Ε-ΒΗΤΑΣ Ε." },
    { id: "b2", scheduleName: "Ξ-ΒΗΤΑΣ Ε." },
    { id: "c", scheduleName: "Δ-ΓΑΜΜΑΣ Α." },
  ];

  it("matches surname and initial", () => {
    expect(matchVisitEntries([entry("ΑΛΦΑΣ ΣΩΚΡΑΤΗΣ")], staff).get("ΑΛΦΑΣ ΣΩΚΡΑΤΗΣ")).toBe("a");
  });

  it("uses the department to split a tie, and never guesses otherwise", () => {
    expect(matchVisitEntries([entry("ΒΗΤΑΣ ΕΛΕΝΑ", "ΦΙΛΟΛΟΓΟΙ")], staff).get("ΒΗΤΑΣ ΕΛΕΝΑ")).toBe("b1");
    expect(matchVisitEntries([entry("ΒΗΤΑΣ ΕΛΕΝΑ", "ΑΛΛΟ")], staff).get("ΒΗΤΑΣ ΕΛΕΝΑ")).toBeNull();
  });

  it("leaves a different initial or an unknown surname for the admin", () => {
    expect(matchVisitEntries([entry("ΑΛΦΑΣ ΝΙΚΟΣ")], staff).get("ΑΛΦΑΣ ΝΙΚΟΣ")).toBeNull();
    expect(matchVisitEntries([entry("ΚΑΝΕΝΑΣ ΑΝΤΡΗ")], staff).get("ΚΑΝΕΝΑΣ ΑΝΤΡΗ")).toBeNull();
  });

  it("doesn't let two different people land on one record", () => {
    const m = matchVisitEntries([entry("ΓΑΜΜΑΣ ΑΝΝΑ"), entry("ΓΑΜΜΑΣ ΑΝΤΡΗ")], staff);
    expect(m.get("ΓΑΜΜΑΣ ΑΝΝΑ")).toBeNull();
    expect(m.get("ΓΑΜΜΑΣ ΑΝΤΡΗ")).toBeNull();
  });

  it("prefers a saved choice, unless that record is gone", () => {
    expect(matchVisitEntries([entry("ΚΑΝΕΝΑΣ ΑΝΤΡΗ")], staff, new Map([["ΚΑΝΕΝΑΣ ΑΝΤΡΗ", "c"]])).get("ΚΑΝΕΝΑΣ ΑΝΤΡΗ")).toBe("c");
    expect(matchVisitEntries([entry("ΚΑΝΕΝΑΣ ΑΝΤΡΗ")], staff, new Map([["ΚΑΝΕΝΑΣ ΑΝΤΡΗ", "gone"]])).get("ΚΑΝΕΝΑΣ ΑΝΤΡΗ")).toBeNull();
  });
});

describe("homegroupListGroupIds", () => {
  it("keeps subject groups, drops support groups, lists each once", () => {
    expect(
      homegroupListGroupIds("h", [
        { id: "fys", name: "ΦΥΣ2" },
        { id: "fys", name: "ΦΥΣ2" },
        { id: "st", name: "ΣΤ_ΕΓ2_ΜΑΘ1" },
        { id: "ast", name: "ΑΣΤ_ΜΕ2_ΕΛΛ" },
      ]),
    ).toEqual(["h", "fys"]);
  });
});

describe("buildVisitRows", () => {
  const profiles = [
    { id: "p1", scheduleName: "Μ-ΑΛΦΑΣ Σ.", department: "Μαθηματικών" },
    { id: "p2", scheduleName: "Ε-ΒΗΤΑΣ Ε.", department: null },
  ];
  const hour = {
    staffProfileId: "p1", slotText: "x", dayOfWeek: 1, period: 2, startTime: "8:20", endTime: "9:00",
    byAppointment: false, phone: null,
  };
  const slot = (staffName: string | null, groupId = "h", courseName = "Μαθηματικά") => ({
    staffName, groupId, groupName: groupId === "h" ? "Α1" : "ΦΥΣ2", courseName,
  });

  it("gives one row per teacher with each lesson once and their hours", () => {
    const rows = buildVisitRows({
      homegroupId: "h", showGroupNames: true,
      slots: [slot("Μ-ΑΛΦΑΣ Σ."), slot("Μ-ΑΛΦΑΣ Σ."), slot("Μ-ΑΛΦΑΣ Σ.", "f", "Φυσική")],
      homeroom: [], profiles, hours: [hour],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lessons).toEqual([{ course: "Μαθηματικά", group: null }, { course: "Φυσική", group: "ΦΥΣ2" }]);
    expect(rows[0]!.hours).toHaveLength(1);
  });

  it("hides group names on a parent's list", () => {
    const [row] = buildVisitRows({
      homegroupId: "h", showGroupNames: false, slots: [slot("Μ-ΑΛΦΑΣ Σ.", "f", "Φυσική")], homeroom: [], profiles, hours: [],
    });
    expect(row!.lessons[0]!.group).toBeNull();
  });

  it("adds homeroom staff, and lists a teacher not in the file with no hours", () => {
    const rows = buildVisitRows({
      homegroupId: "h", showGroupNames: true, slots: [slot("Ε-ΒΗΤΑΣ Ε.")],
      homeroom: [{ staffProfileId: "p1", role: "head" }], profiles, hours: [],
    });
    expect(rows.map((r) => [r.name, r.roles, r.hours.length])).toEqual([
      ["Ε-ΒΗΤΑΣ Ε.", [], 0],
      ["Μ-ΑΛΦΑΣ Σ.", ["head"], 0],
    ]);
  });

  it("keeps a timetable name with no staff record, and skips a slot with no name", () => {
    const rows = buildVisitRows({
      homegroupId: "h", showGroupNames: true, slots: [slot("Φ-ΑΛΛΟΣ"), slot(null)], homeroom: [], profiles, hours: [],
    });
    expect(rows.map((r) => [r.name, r.staffProfileId])).toEqual([["Φ-ΑΛΛΟΣ", null]]);
  });
});
