import { describe, it, expect } from "vitest";
import {
  specialtyPrefix,
  isPoolEligible,
  lastPeriodFor,
  requestActiveOn,
  unavailableStaffIds,
  vacanciesFor,
  buildPlan,
  type SubRequest,
  type SubSlot,
  type SubTeacher,
  type BuildPlanInput,
} from "@/lib/substitutions";

// ── fixtures ─────────────────────────────────────────────────────────────────

const DATE = "2026-03-09"; // Monday
const DOW = 1;
const LAST = 8; // Monday has 8 periods

function slot(p: Partial<SubSlot> & { staffId: string | null; period: number }): SubSlot {
  return {
    slotId: `${p.staffId ?? "x"}-${p.period}-${p.groupId ?? "G1"}`,
    scheduleName: p.scheduleName ?? "ΗΥ-ΤΕΣΤ Α.",
    groupId: "G1",
    groupName: "ΘΗΥ1",
    room: "10",
    courseName: "Μάθημα",
    ...p,
  } as SubSlot;
}

function teacher(p: Partial<SubTeacher> & { staffId: string }): SubTeacher {
  return {
    scheduleName: `ΗΥ-${p.staffId} Α.`,
    maxSubstitutions: null,
    yearCount: 0,
    recentCount: 0,
    ...p,
  } as SubTeacher;
}

function absence(staffId: string, periods: number[] = [], over?: Partial<SubRequest>): SubRequest {
  return {
    id: `req-${staffId}`,
    staffId,
    type: "ABSENCE",
    startDate: DATE,
    endDate: null,
    periods,
    reason: "Ασθένεια",
    groupId: null,
    newRoom: null,
    ...over,
  };
}

function planInput(over: Partial<BuildPlanInput>): BuildPlanInput {
  return { dateIso: DATE, dow: DOW, lastPeriod: LAST, slots: [], teachers: [], requests: [], ...over };
}

// ── name & eligibility helpers ───────────────────────────────────────────────

describe("specialtyPrefix", () => {
  it("extracts the prefix before the first dash", () => {
    expect(specialtyPrefix("ΗΥ-ΜΑΣΙΑ Μ. ΒΔ")).toBe("ΗΥ");
    expect(specialtyPrefix("Μ-ΠΑΠΑΓΙΑΝΝΗ Π.")).toBe("Μ");
  });
  it("returns empty for names without a prefix", () => {
    expect(specialtyPrefix("ΠΑΠΑΣ")).toBe("");
    expect(specialtyPrefix(null)).toBe("");
  });
});

describe("isPoolEligible", () => {
  it("excludes deputies and the Ξ-/Σ- specialties", () => {
    expect(isPoolEligible("ΗΥ-ΜΑΣΙΑ Μ. ΒΔ", null)).toBe(false);
    expect(isPoolEligible("Ξ-ΞΕΝΟΥ Α.", null)).toBe(false);
    expect(isPoolEligible("Σ-ΣΤΗΡΙΞΗ Β.", null)).toBe(false);
  });
  it("excludes quota 0, allows null (unlimited) and positive quotas", () => {
    expect(isPoolEligible("ΗΥ-ΤΕΣΤ Α.", 0)).toBe(false);
    expect(isPoolEligible("ΗΥ-ΤΕΣΤ Α.", null)).toBe(true);
    expect(isPoolEligible("ΗΥ-ΤΕΣΤ Α.", 5)).toBe(true);
  });
});

describe("lastPeriodFor", () => {
  it("reads the periods-per-day config", () => {
    expect(lastPeriodFor(1, { 1: 8, 2: 7 })).toBe(8);
    expect(lastPeriodFor(2, { 1: 8, 2: 7 })).toBe(7);
    expect(lastPeriodFor(3, {})).toBe(7);
  });
});

// ── request expansion ────────────────────────────────────────────────────────

describe("requestActiveOn / unavailableStaffIds / vacanciesFor", () => {
  it("handles single day, range and period absences", () => {
    expect(requestActiveOn(absence("a"), DATE)).toBe(true);
    expect(requestActiveOn(absence("a"), "2026-03-10")).toBe(false);
    const range = absence("a", [], { startDate: "2026-03-08", endDate: "2026-03-11" });
    expect(requestActiveOn(range, DATE)).toBe(true);
  });

  it("exemptions and room changes are single-day", () => {
    const ex = absence("a", [], { type: "EXEMPTION" });
    expect(requestActiveOn(ex, DATE)).toBe(true);
    expect(requestActiveOn({ ...ex, startDate: "2026-03-08" }, DATE)).toBe(false);
  });

  it("marks absent AND exempt staff unavailable", () => {
    const set = unavailableStaffIds(
      [absence("a"), absence("b", [], { type: "EXEMPTION" }), absence("c", [], { type: "ROOM_CHANGE" })],
      DATE
    );
    expect(set.has("a")).toBe(true);
    expect(set.has("b")).toBe(true);
    expect(set.has("c")).toBe(false);
  });

  it("expands a whole-day absence to all the teacher's lessons, periods-absence to those periods", () => {
    const slots = [
      slot({ staffId: "a", period: 1 }),
      slot({ staffId: "a", period: 3 }),
      slot({ staffId: "b", period: 1 }),
    ];
    expect(vacanciesFor([absence("a")], slots, DATE).map((v) => v.slot.period)).toEqual([1, 3]);
    expect(vacanciesFor([absence("a", [3])], slots, DATE).map((v) => v.slot.period)).toEqual([3]);
  });
});

// ── planner rules ────────────────────────────────────────────────────────────

describe("buildPlan", () => {
  it("releases the class when the vacancy is at the last period", () => {
    const entries = buildPlan(
      planInput({
        slots: [slot({ staffId: "a", period: LAST })],
        teachers: [teacher({ staffId: "a" })],
        requests: [absence("a")],
      })
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]!.kind).toBe("RELEASE");
    expect(entries[0]!.period).toBe(LAST);
  });

  it("sends the second of two consecutive vacancies to study hall", () => {
    const entries = buildPlan(
      planInput({
        slots: [
          slot({ staffId: "a", period: 3 }),
          slot({ staffId: "a", period: 4 }),
        ],
        teachers: [
          teacher({ staffId: "a" }),
          teacher({ staffId: "sub", scheduleName: "ΗΥ-ΣΑΒΒΑ Σ." }),
        ].concat([]),
        requests: [absence("a")],
      })
    );
    const p4 = entries.find((e) => e.period === 4);
    expect(p4!.kind).toBe("STUDY_HALL");
    expect(p4!.newRoom).toBe("κιόσκια");
  });

  it("swaps the same class's last-period lesson into the vacancy and releases the last period", () => {
    const entries = buildPlan(
      planInput({
        slots: [
          slot({ staffId: "a", period: 3, groupId: "G1" }),
          slot({ staffId: "b", period: LAST, groupId: "G1", scheduleName: "Φ-ΒΗΤΑ Β.", courseName: "Φυσική" }),
        ],
        teachers: [teacher({ staffId: "a" }), teacher({ staffId: "b", scheduleName: "Φ-ΒΗΤΑ Β." })],
        requests: [absence("a")],
      })
    );
    const swap = entries.find((e) => e.kind === "SWAP");
    const release = entries.find((e) => e.kind === "RELEASE");
    expect(swap!.period).toBe(3);
    expect(swap!.substituteStaffId).toBe("b");
    expect(swap!.note).toContain("Αλλαγή από 8η σε 3η");
    expect(release!.period).toBe(LAST);
  });

  it("does not swap with a teacher who is absent that day", () => {
    const entries = buildPlan(
      planInput({
        slots: [
          slot({ staffId: "a", period: 3, groupId: "G1" }),
          slot({ staffId: "b", period: LAST, groupId: "G1" }),
        ],
        teachers: [teacher({ staffId: "a" }), teacher({ staffId: "b" })],
        requests: [absence("a"), absence("b")],
      })
    );
    expect(entries.some((e) => e.kind === "SWAP")).toBe(false);
  });

  it("merges support classes back to their regular class", () => {
    const entries = buildPlan(
      planInput({
        slots: [slot({ staffId: "a", period: 2, groupName: "ΣΤ1" })],
        teachers: [teacher({ staffId: "a" })],
        requests: [absence("a")],
      })
    );
    expect(entries[0]!.kind).toBe("SUPPORT_MERGE");
  });

  it("covers with a free, eligible teacher and records the rank trace", () => {
    const entries = buildPlan(
      planInput({
        slots: [
          slot({ staffId: "a", period: 2, scheduleName: "ΗΥ-ΑΛΦΑ Α." }),
          // sub teaches periods 1 & 3 (free at 2) — 2 lessons today
          slot({ staffId: "sub", period: 1, groupId: "G2", scheduleName: "ΗΥ-ΣΑΒΒΑ Σ." }),
          slot({ staffId: "sub", period: 3, groupId: "G2", scheduleName: "ΗΥ-ΣΑΒΒΑ Σ." }),
        ],
        teachers: [
          teacher({ staffId: "a", scheduleName: "ΗΥ-ΑΛΦΑ Α." }),
          teacher({ staffId: "sub", scheduleName: "ΗΥ-ΣΑΒΒΑ Σ." }),
        ],
        requests: [absence("a")],
      })
    );
    expect(entries[0]!.kind).toBe("COVER");
    expect(entries[0]!.substituteStaffId).toBe("sub");
    expect(entries[0]!.rankInfo).toContain("ίδια ειδικότητα");
  });

  it("prefers same specialty, then fewest substitutions this year", () => {
    const slots = [
      slot({ staffId: "a", period: 2, scheduleName: "ΗΥ-ΑΛΦΑ Α." }),
      slot({ staffId: "samePrefix", period: 1, groupId: "G2", scheduleName: "ΗΥ-ΙΔΙΟΣ Ι." }),
      slot({ staffId: "otherFewer", period: 1, groupId: "G3", scheduleName: "Φ-ΑΛΛΟΣ Λ." }),
    ];
    const entries = buildPlan(
      planInput({
        slots,
        teachers: [
          teacher({ staffId: "a", scheduleName: "ΗΥ-ΑΛΦΑ Α." }),
          teacher({ staffId: "samePrefix", scheduleName: "ΗΥ-ΙΔΙΟΣ Ι.", yearCount: 5 }),
          teacher({ staffId: "otherFewer", scheduleName: "Φ-ΑΛΛΟΣ Λ.", yearCount: 0 }),
        ],
        requests: [absence("a")],
      })
    );
    // same specialty wins despite more substitutions this year (higher tier)
    expect(entries[0]!.substituteStaffId).toBe("samePrefix");
  });

  it("skips candidates that substituted in the last 7 days, are exempt, busy, or over quota", () => {
    const mk = (over: Partial<SubTeacher>) =>
      buildPlan(
        planInput({
          slots: [
            slot({ staffId: "a", period: 2 }),
            slot({ staffId: "sub", period: 1, groupId: "G2", scheduleName: "Φ-ΣΑΒΒΑ Σ." }),
          ],
          teachers: [teacher({ staffId: "a" }), teacher({ staffId: "sub", scheduleName: "Φ-ΣΑΒΒΑ Σ.", ...over })],
          requests: [absence("a")],
        })
      )[0]!;
    expect(mk({ recentCount: 1 }).kind).toBe("STUDY_HALL"); // 7-day cooldown
    expect(mk({ maxSubstitutions: 0 }).kind).toBe("STUDY_HALL"); // out of pool
    expect(mk({ yearCount: 3, maxSubstitutions: 3 }).kind).toBe("STUDY_HALL"); // quota reached
    expect(mk({}).kind).toBe("COVER"); // control
  });

  it("never picks the same substitute twice in one plan", () => {
    const entries = buildPlan(
      planInput({
        slots: [
          slot({ staffId: "a", period: 2, groupId: "G1" }),
          slot({ staffId: "b", period: 3, groupId: "G2", scheduleName: "Μ-ΒΗΤΑ Β." }),
          slot({ staffId: "sub", period: 1, groupId: "G3", scheduleName: "Φ-ΣΑΒΒΑ Σ." }),
        ],
        teachers: [
          teacher({ staffId: "a" }),
          teacher({ staffId: "b", scheduleName: "Μ-ΒΗΤΑ Β." }),
          teacher({ staffId: "sub", scheduleName: "Φ-ΣΑΒΒΑ Σ." }),
        ],
        requests: [absence("a"), absence("b")],
      })
    );
    const covers = entries.filter((e) => e.kind === "COVER");
    expect(covers).toHaveLength(1); // sub used once; the other vacancy falls back
    expect(entries.filter((e) => e.kind === "STUDY_HALL")).toHaveLength(1);
  });

  it("falls back to study hall when no candidate qualifies", () => {
    const entries = buildPlan(
      planInput({
        slots: [slot({ staffId: "a", period: 2 })],
        teachers: [teacher({ staffId: "a" })],
        requests: [absence("a")],
      })
    );
    expect(entries[0]!.kind).toBe("STUDY_HALL");
    expect(entries[0]!.note).toContain("δεν βρέθηκε");
  });

  it("creates room-change entries and cascades the displaced teacher to a free room", () => {
    const entries = buildPlan(
      planInput({
        slots: [
          // occupant of room 24 at period 3
          slot({ staffId: "occ", period: 3, groupId: "G2", room: "24", scheduleName: "Μ-ΚΑΤΟΧΟΣ Κ." }),
          // room 30 is used at another period only, so it is free at period 3
          slot({ staffId: "x", period: 1, groupId: "G3", room: "30", scheduleName: "Φ-ΧΙ Χ." }),
        ],
        rooms: [
          { name: "24", capacity: 14 },
          { name: "30", capacity: 17 },
        ],
        teachers: [teacher({ staffId: "occ" }), teacher({ staffId: "x" })],
        requests: [
          {
            id: "rc1",
            staffId: "req",
            type: "ROOM_CHANGE",
            startDate: DATE,
            endDate: null,
            periods: [3],
            reason: "Εργαστήριο",
            groupId: "G9",
            newRoom: "24",
          },
        ],
      })
    );
    const changes = entries.filter((e) => e.kind === "ROOM_CHANGE");
    expect(changes).toHaveLength(2);
    expect(changes[0]!.newRoom).toBe("24");
    expect(changes[1]!.absentStaffId).toBe("occ");
    expect(changes[1]!.newRoom).toBe("30");
    expect(changes[1]!.note).toBe("Αυτόματη αλλαγή αίθουσας");
  });
});
