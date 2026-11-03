import { describe, it, expect } from "vitest";
import {
  nextLevel,
  canDecideAt,
  canResolve,
  canEscalate,
  expulsionLimitFor,
  decisionOutcome,
  canCarryOut,
  EXPULSION_MAX_DAYS,
  type ReferralViewer,
} from "@/lib/referralLevels";

const bd: ReferralViewer = { roles: ["HEADTEACHER_B"], headGroupIds: ["g1"], isCouncil: false };
const head: ReferralViewer = { roles: ["HEADMASTER"], headGroupIds: [], isCouncil: false };
const council: ReferralViewer = { roles: ["HEADTEACHER_A"], headGroupIds: [], isCouncil: true };

describe("referral levels", () => {
  it("goes up one way and stops at the council", () => {
    expect(nextLevel("HOMEGROUP")).toBe("HEADMASTER");
    expect(nextLevel("HEADMASTER")).toBe("COUNCIL");
    expect(nextLevel("COUNCIL")).toBeNull();
  });

  it("caps expulsion at 2, 4 and 6 days", () => {
    expect(EXPULSION_MAX_DAYS).toEqual({ HOMEGROUP: 2, HEADMASTER: 4, COUNCIL: 6 });
    expect(expulsionLimitFor(["HEADMASTER", "HOMEGROUP"])).toBe(2);
    expect(expulsionLimitFor(["COUNCIL"])).toBe(6);
  });

  it("lets only the student's homegroup headteacher decide at the first level", () => {
    expect(canDecideAt({ groupId: "g1", level: "HOMEGROUP" }, bd)).toBe(true);
    expect(canDecideAt({ groupId: "g2", level: "HOMEGROUP" }, bd)).toBe(false);
    expect(canDecideAt({ groupId: null, level: "HOMEGROUP" }, bd)).toBe(false);
    expect(canDecideAt({ groupId: "g1", level: "HOMEGROUP" }, head)).toBe(false);
  });

  it("lets only the headmaster decide at the second level, and only the council headteacher at the third", () => {
    expect(canDecideAt({ groupId: "g1", level: "HEADMASTER" }, head)).toBe(true);
    expect(canDecideAt({ groupId: "g1", level: "HEADMASTER" }, bd)).toBe(false);
    expect(canDecideAt({ groupId: "g1", level: "HEADMASTER" }, { ...council, roles: ["HEADTEACHER_A", "HEADMASTER"] })).toBe(true);
    expect(canDecideAt({ groupId: "g1", level: "COUNCIL" }, council)).toBe(true);
    expect(canDecideAt({ groupId: "g1", level: "COUNCIL" }, head)).toBe(false);
  });

  it("the homegroup headteacher loses the student once referred up", () => {
    expect(canResolve({ groupId: "g1", level: "HEADMASTER", resolved: false }, bd)).toBe(false);
    expect(canEscalate({ groupId: "g1", level: "HEADMASTER", resolved: false }, bd)).toBe(false);
  });

  it("refers up only an undecided student, never past the council", () => {
    expect(canEscalate({ groupId: "g1", level: "HOMEGROUP", resolved: false }, bd)).toBe(true);
    expect(canEscalate({ groupId: "g1", level: "HOMEGROUP", resolved: true }, bd)).toBe(false);
    expect(canEscalate({ groupId: "g1", level: "HEADMASTER", resolved: false }, head)).toBe(true);
    expect(canEscalate({ groupId: "g1", level: "COUNCIL", resolved: false }, council)).toBe(false);
    expect(canResolve({ groupId: "g1", level: "COUNCIL", resolved: false }, council)).toBe(true);
    expect(canResolve({ groupId: "g1", level: "COUNCIL", resolved: true }, council)).toBe(false);
  });
});

describe("a higher level's measure returns to the homegroup headteacher", () => {
  it("resolves at once at the homegroup level, and waits to be carried out otherwise", () => {
    expect(decisionOutcome("HOMEGROUP")).toEqual({ status: "RESOLVED", level: "HOMEGROUP" });
    expect(decisionOutcome("HEADMASTER")).toEqual({ status: "PENDING", level: "HOMEGROUP" });
    expect(decisionOutcome("COUNCIL")).toEqual({ status: "PENDING", level: "HOMEGROUP" });
  });

  it("lets only the student's homegroup headteacher carry it out, once, while pending", () => {
    const back = { groupId: "g1", level: "HOMEGROUP" as const, hasDecision: true, pending: true };
    expect(canCarryOut(back, bd)).toBe(true);
    expect(canCarryOut({ ...back, groupId: "g2" }, bd)).toBe(false);
    expect(canCarryOut(back, head)).toBe(false);
    expect(canCarryOut({ ...back, pending: false }, bd)).toBe(false);
    expect(canCarryOut({ ...back, hasDecision: false }, bd)).toBe(false);
  });

  it("does not let the homegroup headteacher decide again once a measure was chosen", () => {
    expect(canResolve({ groupId: "g1", level: "HOMEGROUP", resolved: true }, bd)).toBe(false);
    expect(canEscalate({ groupId: "g1", level: "HOMEGROUP", resolved: true }, bd)).toBe(false);
  });
});
