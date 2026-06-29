import { describe, it, expect } from "vitest";
import { enrollmentSyncPlan } from "@/lib/enrollmentSync";

describe("enrollmentSyncPlan", () => {
  it("adds groups in the file that are missing", () => {
    expect(enrollmentSyncPlan(["a"], ["a", "b"], true)).toEqual({ toAdd: ["b"], toRemove: [] });
  });

  it("removes stale links no longer in the file (a moved/removed group)", () => {
    expect(enrollmentSyncPlan(["a", "b"], ["a"], true)).toEqual({ toAdd: [], toRemove: ["b"] });
  });

  it("handles a move: drop the old group, add the new one", () => {
    expect(enrollmentSyncPlan(["a", "old"], ["a", "new"], true)).toEqual({
      toAdd: ["new"],
      toRemove: ["old"],
    });
  });

  it("does nothing when already in sync", () => {
    expect(enrollmentSyncPlan(["a", "b"], ["b", "a"], true)).toEqual({ toAdd: [], toRemove: [] });
  });

  it("never removes when the row had an unknown code (incomplete target)", () => {
    // rowComplete=false → only add, keep existing links intact.
    expect(enrollmentSyncPlan(["a", "b"], ["a"], false)).toEqual({ toAdd: [], toRemove: [] });
  });

  it("never wipes everything from a blank/empty row", () => {
    expect(enrollmentSyncPlan(["a", "b"], [], true)).toEqual({ toAdd: [], toRemove: [] });
  });

  it("adds to a student with no current links", () => {
    expect(enrollmentSyncPlan([], ["a", "b"], true)).toEqual({ toAdd: ["a", "b"], toRemove: [] });
  });
});
