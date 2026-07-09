import { describe, it, expect } from "vitest";
import { enrollmentSyncPlan } from "@/lib/enrollmentSync";

// Unless a test is about scoping, the file "mentions" every group involved.
const allInFile = new Set(["a", "b", "old", "new"]);

describe("enrollmentSyncPlan", () => {
  it("adds groups in the file that are missing", () => {
    expect(enrollmentSyncPlan(["a"], ["a", "b"], true, allInFile)).toEqual({ toAdd: ["b"], toRemove: [] });
  });

  it("removes stale links no longer in the file (a moved/removed group)", () => {
    expect(enrollmentSyncPlan(["a", "b"], ["a"], true, allInFile)).toEqual({ toAdd: [], toRemove: ["b"] });
  });

  it("handles a move: drop the old group, add the new one", () => {
    expect(enrollmentSyncPlan(["a", "old"], ["a", "new"], true, allInFile)).toEqual({
      toAdd: ["new"],
      toRemove: ["old"],
    });
  });

  it("does nothing when already in sync", () => {
    expect(enrollmentSyncPlan(["a", "b"], ["b", "a"], true, allInFile)).toEqual({ toAdd: [], toRemove: [] });
  });

  it("never removes a link to a group the file does not mention (out-of-band)", () => {
    // "support" was assigned by hand / another tool; the uploaded file carries
    // only academic groups, so it must not touch the support link.
    expect(enrollmentSyncPlan(["a", "support"], ["a"], true, new Set(["a", "b"]))).toEqual({
      toAdd: [],
      toRemove: [],
    });
  });

  it("removes a stale link when the group appears elsewhere in the file", () => {
    // "b" is not in THIS student's row but another row mentions it — the file
    // knows the group, so dropping it here is an intentional removal.
    expect(enrollmentSyncPlan(["a", "b", "support"], ["a"], true, new Set(["a", "b"]))).toEqual({
      toAdd: [],
      toRemove: ["b"],
    });
  });

  it("never removes when the row had an unknown code (incomplete target)", () => {
    // rowComplete=false → only add, keep existing links intact.
    expect(enrollmentSyncPlan(["a", "b"], ["a"], false, allInFile)).toEqual({ toAdd: [], toRemove: [] });
  });

  it("never wipes everything from a blank/empty row", () => {
    expect(enrollmentSyncPlan(["a", "b"], [], true, allInFile)).toEqual({ toAdd: [], toRemove: [] });
  });

  it("adds to a student with no current links", () => {
    expect(enrollmentSyncPlan([], ["a", "b"], true, allInFile)).toEqual({ toAdd: ["a", "b"], toRemove: [] });
  });
});
