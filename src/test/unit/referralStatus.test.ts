import { describe, it, expect } from "vitest";
import { overallStatus, referralColor, referralColorScoped, referralGroupSignals, canDeleteReferral } from "@/lib/referralStatus";

const students = (statuses: string[]) => statuses.map((status) => ({ status }));

describe("overallStatus", () => {
  it("is DRAFT for a draft regardless of students", () => {
    expect(overallStatus({ isDraft: true, students: students(["PENDING"]) })).toBe("DRAFT");
  });

  it("is PENDING when no student is resolved", () => {
    expect(overallStatus({ isDraft: false, students: students(["PENDING", "PENDING"]) })).toBe("PENDING");
  });

  it("is PARTIAL when some but not all are resolved", () => {
    expect(overallStatus({ isDraft: false, students: students(["RESOLVED", "PENDING"]) })).toBe("PARTIAL");
  });

  it("is RESOLVED when every student is resolved", () => {
    expect(overallStatus({ isDraft: false, students: students(["RESOLVED", "RESOLVED"]) })).toBe("RESOLVED");
  });

  it("is PENDING for a filed referral with no students", () => {
    expect(overallStatus({ isDraft: false, students: [] })).toBe("PENDING");
  });
});

describe("referralColor", () => {
  it("is GRAY for a draft", () => {
    expect(referralColor({ isDraft: true, openedAt: null, students: students(["PENDING"]) })).toBe("GRAY");
  });

  it("is RED when filed but not opened and nothing resolved", () => {
    expect(referralColor({ isDraft: false, openedAt: null, students: students(["PENDING", "PENDING"]) })).toBe("RED");
  });

  it("is YELLOW once opened even if nothing is resolved yet", () => {
    expect(
      referralColor({ isDraft: false, openedAt: new Date(), students: students(["PENDING", "PENDING"]) })
    ).toBe("YELLOW");
  });

  it("is YELLOW when partially resolved even without an explicit openedAt", () => {
    expect(
      referralColor({ isDraft: false, openedAt: null, students: students(["RESOLVED", "PENDING"]) })
    ).toBe("YELLOW");
  });

  it("is GREEN when every student is resolved", () => {
    expect(
      referralColor({ isDraft: false, openedAt: new Date(), students: students(["RESOLVED", "RESOLVED"]) })
    ).toBe("GREEN");
  });

  it("accepts an ISO string for openedAt", () => {
    expect(
      referralColor({ isDraft: false, openedAt: "2026-06-02T10:00:00Z", students: students(["PENDING"]) })
    ).toBe("YELLOW");
  });

  it("is RED for a filed referral with no students yet", () => {
    expect(referralColor({ isDraft: false, openedAt: null, students: [] })).toBe("RED");
  });
});

describe("referralColorScoped", () => {
  // Referral with one student in group A (resolved) and one in group B (pending).
  const mixed = {
    isDraft: false,
    openedAt: new Date(),
    students: [
      { status: "RESOLVED", groupId: "A" },
      { status: "PENDING", groupId: "B" },
    ],
  };

  it("is GREEN for the headteacher whose own students are all resolved", () => {
    expect(referralColorScoped(mixed, ["A"])).toBe("GREEN");
  });

  it("is still in-progress for the headteacher with a pending student", () => {
    expect(referralColorScoped(mixed, ["B"])).toBe("YELLOW");
  });

  it("falls back to the overall colour with no/empty scope (teacher/management)", () => {
    expect(referralColorScoped(mixed, [])).toBe("YELLOW"); // partial overall
    expect(referralColorScoped(mixed, null)).toBe("YELLOW");
  });

  it("falls back to overall when the viewer has no students in the referral", () => {
    expect(referralColorScoped(mixed, ["Z"])).toBe("YELLOW");
  });
});

describe("referralGroupSignals", () => {
  it("returns one colour per distinct group", () => {
    const signals = referralGroupSignals({
      isDraft: false,
      openedAt: new Date(),
      students: [
        { status: "RESOLVED", groupId: "A" },
        { status: "RESOLVED", groupId: "A" },
        { status: "PENDING", groupId: "B" },
      ],
    });
    expect(signals).toHaveLength(2);
    expect(signals.find((s) => s.groupId === "A")?.color).toBe("GREEN");
    expect(signals.find((s) => s.groupId === "B")?.color).toBe("YELLOW");
  });

  it("ignores students without a group and returns nothing for drafts", () => {
    expect(
      referralGroupSignals({ isDraft: false, openedAt: null, students: [{ status: "PENDING", groupId: null }] })
    ).toEqual([]);
    expect(
      referralGroupSignals({ isDraft: true, openedAt: null, students: [{ status: "PENDING", groupId: "A" }] })
    ).toEqual([]);
  });
});

describe("canDeleteReferral", () => {
  const ME = "sp_me";
  const base = { filerId: ME, isDraft: false, openedAt: null, students: [{ status: "PENDING" }] };

  it("lets the filer delete their own draft", () => {
    expect(canDeleteReferral({ ...base, isDraft: true }, ME)).toBe(true);
  });

  it("lets the filer withdraw a filed referral nobody has opened", () => {
    expect(canDeleteReferral(base, ME)).toBe(true);
  });

  it("refuses once a headteacher has opened it", () => {
    expect(canDeleteReferral({ ...base, openedAt: new Date() }, ME)).toBe(false);
  });

  it("accepts an ISO string for openedAt", () => {
    expect(canDeleteReferral({ ...base, openedAt: "2026-06-02T10:00:00Z" }, ME)).toBe(false);
  });

  it("refuses someone who did not file it", () => {
    expect(canDeleteReferral(base, "sp_someone_else")).toBe(false);
  });

  it("refuses a viewer with no staff profile", () => {
    expect(canDeleteReferral(base, null)).toBe(false);
    expect(canDeleteReferral(base, undefined)).toBe(false);
  });

  it("refuses when any student already has a resolution", () => {
    expect(
      canDeleteReferral({ ...base, students: [{ status: "PENDING" }, { status: "RESOLVED" }] }, ME),
    ).toBe(false);
  });

  it("still allows a draft even if it somehow carries a resolved student", () => {
    // Drafts are never visible to a resolver, so this cannot arise in practice;
    // the draft branch is unconditional on purpose and this pins that down.
    expect(
      canDeleteReferral({ ...base, isDraft: true, students: [{ status: "RESOLVED" }] }, ME),
    ).toBe(true);
  });

  it("allows a filed referral with no students yet", () => {
    expect(canDeleteReferral({ ...base, students: [] }, ME)).toBe(true);
  });

  it("checks ownership before anything else", () => {
    expect(canDeleteReferral({ ...base, isDraft: true }, "sp_other")).toBe(false);
  });

  it("agrees with the colour helper: only RED or GRAY referrals are deletable", () => {
    for (const openedAt of [null, new Date()]) {
      for (const statuses of [["PENDING"], ["RESOLVED"], ["PENDING", "RESOLVED"]]) {
        const r = { ...base, openedAt, students: statuses.map((status) => ({ status })) };
        const colour = referralColor(r);
        if (canDeleteReferral(r, ME)) expect(colour).toBe("RED");
      }
    }
  });
});
