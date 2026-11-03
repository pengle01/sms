import { describe, it, expect } from "vitest";
import {
  nextLevel,
  canDecideAt,
  canResolve,
  canEscalate,
  expulsionLimitFor,
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
