import { describe, it, expect } from "vitest";
import {
  type StaffRow,
  staffStatus,
  staffSpecialty,
  isManagementRow,
  staffRowLabel,
  filterStaff,
  staffSpecialties,
  sortStaff,
  lessonsByName,
  hasPhone,
  migrateLegacyRole,
  isStaffPost,
} from "@/lib/staffFilter";

function row(over: Partial<StaffRow> = {}): StaffRow {
  return {
    userId: null,
    staffProfileId: "sp1",
    scheduleName: "ΗΥ-ΠΑΠΑΔΟΠΟΥΛΟΥ Μ.",
    name: null,
    nameEl: null,
    email: null,
    phone: null,
    role: null,
    isActive: true,
    extraAdmin: false,
    specialEducation: false,
    ddkCoordinator: false,
    substitutionCoordinator: false,
    homerooms: [],
    lessons: 0,
    ...over,
  };
}

describe("staffStatus", () => {
  it("returns linked when the profile has a user", () => {
    expect(staffStatus(row({ userId: "u1" }))).toBe("linked");
  });

  it("returns awaiting for a schedule name with no user", () => {
    expect(staffStatus(row({ userId: null, scheduleName: "Μ-ΑΡΝΟΣ Σ." }))).toBe("awaiting");
  });

  it("returns orphaned when there is neither a user nor a schedule name", () => {
    expect(staffStatus(row({ userId: null, scheduleName: null }))).toBe("orphaned");
  });

  it("counts an account with no staff profile as linked", () => {
    expect(staffStatus(row({ userId: "u1", staffProfileId: null, scheduleName: null }))).toBe(
      "linked",
    );
  });
});

describe("staffSpecialty", () => {
  it("takes the prefix before the dash", () => {
    expect(staffSpecialty(row({ scheduleName: "ΗΥ-ΜΑΣΙΑ Μ. ΒΔ" }))).toBe("ΗΥ");
  });

  it("is empty when there is no schedule name", () => {
    expect(staffSpecialty(row({ scheduleName: null }))).toBe("");
  });
});

describe("isManagementRow", () => {
  it("is true for a ΒΔ marker on the schedule name", () => {
    expect(isManagementRow(row({ scheduleName: "ΗΥ-ΜΑΣΙΑ Μ. ΒΔ" }))).toBe(true);
  });

  it("is true for a ΒΔΑ marker", () => {
    expect(isManagementRow(row({ scheduleName: "Φ-ΓΕΩΡΓΙΟΥ Α. ΒΔΑ" }))).toBe(true);
  });

  it("is true for the headmaster's Δ marker", () => {
    expect(isManagementRow(row({ scheduleName: "Ξ-ΑΝΔΡΕΟΥ Ι. Δ" }))).toBe(true);
  });

  it("is false for an initial that happens to be Δ", () => {
    expect(isManagementRow(row({ scheduleName: "Ε-ΛΑΜΠΡΟΥ Δ." }))).toBe(false);
  });

  it("is true for a management account role even with no schedule marker", () => {
    expect(isManagementRow(row({ scheduleName: "Α-ΝΙΚΟΛΑΟΥ Κ.", role: "HEADMASTER" }))).toBe(true);
  });

  it("is false for a plain teacher", () => {
    expect(isManagementRow(row({ scheduleName: "Α-ΝΙΚΟΛΑΟΥ Κ.", role: "TEACHER" }))).toBe(false);
  });
});

describe("staffRowLabel", () => {
  it("prefers the schedule coding", () => {
    expect(staffRowLabel(row({ scheduleName: "Μ-ΑΡΝΟΣ Σ.", name: "Σάββας Άρνος" }))).toBe(
      "Μ-ΑΡΝΟΣ Σ.",
    );
  });

  it("falls back to the account name", () => {
    expect(staffRowLabel(row({ scheduleName: null, name: "Σάββας Άρνος" }))).toBe("Σάββας Άρνος");
  });

  it("is empty when there is neither", () => {
    expect(staffRowLabel(row({ scheduleName: null, name: null }))).toBe("");
  });
});

describe("filterStaff", () => {
  const roster = [
    row({ staffProfileId: "a", scheduleName: "ΗΥ-ΠΑΠΑΔΟΠΟΥΛΟΥ Μ.", userId: "u1", role: "TEACHER",
          name: "Μαρία Παπαδοπούλου", email: "maria@school.cy", lessons: 18,
          homerooms: ["ΘΒΣ3"] }),
    row({ staffProfileId: "b", scheduleName: "ΗΥ-ΓΕΩΡΓΙΟΥ Α. ΒΔ" }),
    row({ staffProfileId: "c", scheduleName: "Μ-ΑΡΝΟΣ Σ.", specialEducation: true }),
    row({ staffProfileId: "d", scheduleName: null, userId: null }),
    row({ staffProfileId: null, scheduleName: null, userId: "u2", role: "SCHOOL_ADMIN",
          name: "Γραμματεία", email: "office@school.cy" }),
  ];

  it("returns everything when nothing is set", () => {
    expect(filterStaff(roster, {})).toHaveLength(5);
  });

  it("filters by status", () => {
    expect(filterStaff(roster, { status: "linked" }).map((r) => r.staffProfileId)).toEqual([
      "a",
      null,
    ]);
    expect(filterStaff(roster, { status: "awaiting" }).map((r) => r.staffProfileId)).toEqual([
      "b",
      "c",
    ]);
    expect(filterStaff(roster, { status: "orphaned" }).map((r) => r.staffProfileId)).toEqual(["d"]);
  });

  it("filters by specialty prefix", () => {
    expect(filterStaff(roster, { specialty: "ΗΥ" }).map((r) => r.staffProfileId)).toEqual([
      "a",
      "b",
    ]);
  });

  it("filters by account role", () => {
    expect(filterStaff(roster, { role: "TEACHER" }).map((r) => r.staffProfileId)).toEqual(["a"]);
  });

  it("filters by the derived management pseudo-role", () => {
    expect(filterStaff(roster, { role: "management" }).map((r) => r.staffProfileId)).toEqual(["b"]);
  });

  it("filters by designation", () => {
    expect(filterStaff(roster, { post: "specialEd" }).map((r) => r.staffProfileId)).toEqual(["c"]);
    expect(filterStaff(roster, { post: "homeroom" }).map((r) => r.staffProfileId)).toEqual(["a"]);
  });

  it("ignores an unknown designation rather than emptying the list", () => {
    expect(filterStaff(roster, { post: "nonsense" })).toHaveLength(5);
  });

  it("matches the schedule name", () => {
    expect(filterStaff(roster, { q: "ΑΡΝΟΣ" }).map((r) => r.staffProfileId)).toEqual(["c"]);
  });

  it("matches the account name accent-insensitively", () => {
    expect(filterStaff(roster, { q: "παπαδοπουλου" }).map((r) => r.staffProfileId)).toEqual(["a"]);
  });

  it("matches a final sigma against a medial sigma", () => {
    expect(filterStaff(roster, { q: "αρνος" }).map((r) => r.staffProfileId)).toEqual(["c"]);
  });

  it("matches the email", () => {
    expect(filterStaff(roster, { q: "office@" }).map((r) => r.staffProfileId)).toEqual([null]);
  });

  it("matches the Greek account name field", () => {
    const rows = [row({ staffProfileId: "e", scheduleName: null, nameEl: "Νίκος Νικολάου" })];
    expect(filterStaff(rows, { q: "νικολαου" })).toHaveLength(1);
  });

  it("treats an all-whitespace query as no query", () => {
    expect(filterStaff(roster, { q: "   " })).toHaveLength(5);
  });

  it("combines a specialty with a status", () => {
    expect(
      filterStaff(roster, { specialty: "ΗΥ", status: "awaiting" }).map((r) => r.staffProfileId),
    ).toEqual(["b"]);
  });

  it("returns nothing when the combination matches nobody", () => {
    expect(filterStaff(roster, { specialty: "Μ", role: "TEACHER" })).toEqual([]);
  });

  it("returns an empty array for an empty roster", () => {
    expect(filterStaff([], { q: "anything" })).toEqual([]);
  });
});

describe("staffSpecialties", () => {
  it("counts each prefix, commonest first", () => {
    const rows = [
      row({ scheduleName: "ΗΥ-Α Α." }),
      row({ scheduleName: "ΗΥ-Β Β." }),
      row({ scheduleName: "Μ-Γ Γ." }),
    ];
    expect(staffSpecialties(rows)).toEqual([
      { code: "ΗΥ", count: 2 },
      { code: "Μ", count: 1 },
    ]);
  });

  it("breaks ties by Greek collation", () => {
    const rows = [row({ scheduleName: "Μ-Α Α." }), row({ scheduleName: "Α-Β Β." })];
    expect(staffSpecialties(rows).map((s) => s.code)).toEqual(["Α", "Μ"]);
  });

  it("skips profiles with no schedule name", () => {
    expect(staffSpecialties([row({ scheduleName: null })])).toEqual([]);
  });

  it("is empty for an empty roster", () => {
    expect(staffSpecialties([])).toEqual([]);
  });
});

describe("sortStaff", () => {
  it("orders by display name with Greek collation", () => {
    const rows = [
      row({ staffProfileId: "b", scheduleName: "Β-ΒΑΣΙΛΕΙΟΥ Α." }),
      row({ staffProfileId: "a", scheduleName: "Α-ΑΝΔΡΕΟΥ Α." }),
    ];
    expect(sortStaff(rows).map((r) => r.staffProfileId)).toEqual(["a", "b"]);
  });

  it("sorts an account-only row under its account name", () => {
    const rows = [
      row({ staffProfileId: "z", scheduleName: "Ω-ΩΜΕΓΑ Ω." }),
      row({ staffProfileId: null, scheduleName: null, name: "Άννα Αντωνίου" }),
    ];
    expect(sortStaff(rows).map((r) => staffRowLabel(r))).toEqual([
      "Άννα Αντωνίου",
      "Ω-ΩΜΕΓΑ Ω.",
    ]);
  });

  it("does not mutate the input", () => {
    const rows = [row({ scheduleName: "Β-Β Β." }), row({ scheduleName: "Α-Α Α." })];
    sortStaff(rows);
    expect(rows[0]!.scheduleName).toBe("Β-Β Β.");
  });
});

describe("lessonsByName", () => {
  it("keys the count by schedule name", () => {
    const m = lessonsByName([
      { staffName: "ΗΥ-ΜΑΣΙΑ Μ. ΒΔ", _count: 18 },
      { staffName: "Μ-ΑΡΝΟΣ Σ.", _count: 22 },
    ]);
    expect(m.get("ΗΥ-ΜΑΣΙΑ Μ. ΒΔ")).toBe(18);
    expect(m.get("Μ-ΑΡΝΟΣ Σ.")).toBe(22);
  });

  it("skips slots with no staff name", () => {
    expect(lessonsByName([{ staffName: null, _count: 5 }]).size).toBe(0);
  });

  it("reports nothing for a teacher with no lessons", () => {
    expect(lessonsByName([]).get("Μ-ΑΡΝΟΣ Σ.")).toBeUndefined();
  });
});

describe("isStaffPost", () => {
  it("accepts the known designations", () => {
    expect(isStaffPost("specialEd")).toBe(true);
    expect(isStaffPost("homeroom")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isStaffPost("TEACHER")).toBe(false);
    expect(isStaffPost(undefined)).toBe(false);
  });
});

describe("migrateLegacyRole", () => {
  it("maps the old unlinked tab onto the awaiting status", () => {
    expect(migrateLegacyRole("unlinked")).toEqual({ status: "awaiting" });
  });

  it("maps an old designation tab onto post", () => {
    expect(migrateLegacyRole("specialEd")).toEqual({ post: "specialEd" });
    expect(migrateLegacyRole("subCoord")).toEqual({ post: "subCoord" });
  });

  it("keeps a real role as a role", () => {
    expect(migrateLegacyRole("TEACHER")).toEqual({ role: "TEACHER" });
  });

  it("treats the old all tab and a missing param as no filter", () => {
    expect(migrateLegacyRole("all")).toEqual({});
    expect(migrateLegacyRole(undefined)).toEqual({});
  });
});

describe("hasPhone", () => {
  it("is true for a real number", () => {
    expect(hasPhone(row({ phone: "99910252" }))).toBe(true);
  });

  it("is false for null and for empty", () => {
    expect(hasPhone(row({ phone: null }))).toBe(false);
    expect(hasPhone(row({ phone: "" }))).toBe(false);
  });

  it("treats whitespace as absent — a space is not dialable", () => {
    expect(hasPhone(row({ phone: "   " }))).toBe(false);
  });
});

describe("filterStaff — phone facet", () => {
  const roster = [
    row({ staffProfileId: "a", scheduleName: "ΗΥ-Α Α.", phone: "99910252" }),
    row({ staffProfileId: "b", scheduleName: "ΗΥ-Β Β.", phone: null }),
    row({ staffProfileId: "c", scheduleName: "Μ-Γ Γ.", phone: "  " }),
    row({ staffProfileId: "d", scheduleName: "Μ-Δ Δ.", phone: "99441107" }),
  ];

  it("finds the rows with a number", () => {
    expect(filterStaff(roster, { phone: "present" }).map((r) => r.staffProfileId)).toEqual(["a", "d"]);
  });

  it("finds the rows still missing one, whitespace included", () => {
    expect(filterStaff(roster, { phone: "missing" }).map((r) => r.staffProfileId)).toEqual(["b", "c"]);
  });

  it("ignores an unrecognised value rather than emptying the list", () => {
    expect(filterStaff(roster, { phone: "maybe" })).toHaveLength(4);
  });

  it("composes with a specialty", () => {
    expect(
      filterStaff(roster, { specialty: "ΗΥ", phone: "present" }).map((r) => r.staffProfileId),
    ).toEqual(["a"]);
    expect(
      filterStaff(roster, { specialty: "Μ", phone: "missing" }).map((r) => r.staffProfileId),
    ).toEqual(["c"]);
  });

  it("the two halves always add up to the whole roster", () => {
    const present = filterStaff(roster, { phone: "present" }).length;
    const missing = filterStaff(roster, { phone: "missing" }).length;
    expect(present + missing).toBe(roster.length);
  });
});
